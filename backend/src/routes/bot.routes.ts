import { Router } from "express";
import type { Request } from "express";
import type {} from "../middlewares/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { advanceBot, validateFlow, type BotState } from "../services/bot-flow.js";
import type { Prisma } from "../../generated/prisma/client.js";

export function createBotRouter(database = prisma) {
const prisma = database;
const botRouter = Router();
const json = (value: unknown) => value as Prisma.InputJsonValue;
const errorMessage = (error: unknown) => error instanceof Error && !("clientVersion" in error) ? error.message : "Não foi possível concluir a operação no banco de dados.";
async function resolveBotOrganization(request: Request, botId: string) {
  const bot = await prisma.bot.findUnique({ where: { id: botId }, select: { organizationId: true } });
  if (!bot) return null;
  const member = await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: bot.organizationId, userId: request.user!.id } }, select: { role: true } });
  return member && ["owner", "admin"].includes(member.role) ? bot.organizationId : null;
}
async function resolveOrganization(request: Request, botId?: string) {
  if (request.activeOrganizationId) return request.activeOrganizationId;
  if (botId) return resolveBotOrganization(request, botId);
  const member = await prisma.member.findFirst({
    where: { userId: request.user!.id, role: { in: ["owner", "admin"] } },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  return member?.organizationId ?? null;
}

botRouter.use("/bots", async (req, res, next) => {
  if (req.path === "/simulate") return next();
  const pathParts = req.path.split("/");
  const botId = pathParts[1];
  const organizationId = await resolveOrganization(req, botId);
  if (!organizationId) return res.status(409).json({ message: "Não foi possível identificar a empresa do bot." });
  req.activeOrganizationId = organizationId;
  const member = await prisma.member.findUnique({ where: { organizationId_userId: { organizationId, userId: req.user!.id } } });
  if (!member || !["owner", "admin"].includes(member.role)) return res.status(403).json({ message: "Apenas administradores da empresa podem gerenciar bots." });
  next();
});

botRouter.get("/bots", async (req, res) => {
  const instance = process.env.EVOLUTION_INSTANCE;
  const binding = instance ? await prisma.botInstance.findUnique({ where: { instance } }) : null;
  res.json({ bots: await prisma.bot.findMany({ where: { organizationId: req.activeOrganizationId! }, orderBy: { createdAt: "desc" } }),
    activeBotId: binding && binding.organizationId === req.activeOrganizationId ? binding.activeBotId : null,
    instanceAvailable: Boolean(instance && (!binding || binding.organizationId === req.activeOrganizationId)) });
});

botRouter.post("/bots", async (req, res) => {
  try {
    validateFlow(req.body?.draft);
    const name = req.body?.name;
    if (typeof name !== "string" || !name.trim() || name.length > 100) throw new Error("Informe um nome de até 100 caracteres.");
    res.status(201).json(await prisma.bot.create({ data: { organizationId: req.activeOrganizationId!, name: name.trim(), draft: json(req.body.draft) } }));
  } catch (error) { res.status(400).json({ message: errorMessage(error) }); }
});

botRouter.put("/bots/:id", async (req, res) => {
  try {
    validateFlow(req.body?.draft);
    const { name, revision } = req.body;
    if (typeof name !== "string" || !name.trim() || name.length > 100 || !Number.isInteger(revision)) throw new Error("Nome ou revisão inválidos.");
    const organizationId = req.activeOrganizationId || await resolveBotOrganization(req, String(req.params.id));
    if (!organizationId) return res.status(403).json({ message: "Você não tem permissão para editar este bot." });
    const result = await prisma.bot.updateMany({ where: { id: String(req.params.id), organizationId, revision }, data: { name: name.trim(), draft: json(req.body.draft), revision: { increment: 1 } } });
    if (!result.count) return res.status(409).json({ message: "Bot alterado por outra sessão ou indisponível. Recarregue a página." });
    res.json(await prisma.bot.findUnique({ where: { id: String(req.params.id) } }));
  } catch (error) { res.status(400).json({ message: errorMessage(error) }); }
});

botRouter.post("/bots/:id/publish", async (req, res) => {
  try {
    if (!Number.isInteger(req.body?.revision)) return res.status(400).json({ message: "Revisão inválida." });
    const organizationId = req.activeOrganizationId || await resolveBotOrganization(req, String(req.params.id));
    if (!organizationId) return res.status(403).json({ message: "Você não tem permissão para publicar este bot." });
    const bot = await prisma.bot.findFirst({ where: { id: String(req.params.id), organizationId } });
    if (!bot) return res.status(404).json({ message: "Bot não encontrado." });
    validateFlow(bot.draft, true);
    const result = await prisma.bot.updateMany({ where: { id: bot.id, revision: req.body.revision }, data: { published: json(bot.draft), revision: { increment: 1 }, publishedRevision: { increment: 1 } } });
    if (!result.count) return res.status(409).json({ message: "Rascunho alterado. Recarregue antes de publicar." });
    res.json(await prisma.bot.findUnique({ where: { id: bot.id } }));
  } catch (error) { res.status(400).json({ message: errorMessage(error) }); }
});

botRouter.post("/bots/:id/activation", async (req, res) => {
  const organizationId = req.activeOrganizationId!;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!instance) return res.status(503).json({ message: "Evolution não configurada." });
  if (req.body?.active && !process.env.BOT_WEBHOOK_SECRET) return res.status(503).json({ message: "Configure BOT_WEBHOOK_SECRET no servidor e no webhook da Evolution antes de ativar." });
  if (typeof req.body?.active !== "boolean") return res.status(400).json({ message: "Status inválido." });
  const bot = await prisma.bot.findFirst({ where: { id: String(req.params.id), organizationId } });
  if (!bot) return res.status(404).json({ message: "Bot não encontrado." });
  if (req.body.active && !bot.published) return res.status(400).json({ message: "Publique o bot antes de ativar." });
  try {
    await prisma.$transaction(async tx => {
      // Unique instance key prevents two tenants from claiming the same integration.
      await tx.botInstance.upsert({ where: { instance }, create: { instance, organizationId }, update: {} });
      const binding = await tx.botInstance.findUniqueOrThrow({ where: { instance } });
      if (binding.organizationId !== organizationId) throw new Error("Esta instância já pertence a outra empresa.");
      await tx.botInstance.updateMany({ where: { instance, organizationId, ...(req.body.active ? {} : { activeBotId: bot.id }) }, data: { activeBotId: req.body.active ? bot.id : null } });
    });
    res.json({ success: true });
  } catch { res.status(409).json({ message: "Não foi possível ativar: instância vinculada a outra empresa ou ocupada. Tente novamente." }); }
});

botRouter.post("/bots/simulate", (req, res) => {
  try {
    validateFlow(req.body?.flow);
    // Rebuild simulator state by replaying inputs; never trust client state pointers.
    const inputs: unknown = req.body?.inputs;
    if (!Array.isArray(inputs) || inputs.length > 100 || inputs.some(v => typeof v !== "string" || v.length > 100)) throw new Error("Simulação inválida (máximo 100 passos).");
    let state: BotState | null = null;
    const messages: { role: string; text: string }[] = [];
    for (const input of ["", ...inputs]) {
      if (state) messages.push({ role: "user", text: input });
      const result = advanceBot(req.body.flow, state, input);
      state = result.state;
      if (result.text) messages.push({ role: "bot", text: result.text });
    }
    res.json({ state, messages });
  } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Simulação inválida." }); }
});
return botRouter;
}

export const botRouter = createBotRouter();
