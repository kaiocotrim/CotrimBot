import { Router } from "express";
import type { Request } from "express";
import type {} from "../middlewares/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { advanceBot, validateFlow, type BotState } from "../services/bot-flow.js";
import type { Prisma } from "../../generated/prisma/client.js";
import multer from "multer";
import { BOT_IMAGE_MAX_BYTES, botImageIds, botImageMime } from "../services/bot-image.js";

export function createBotRouter(database = prisma) {
const prisma = database;
const botRouter = Router();
const json = (value: unknown) => value as Prisma.InputJsonValue;
const errorMessage = (error: unknown) => error instanceof Error && !("clientVersion" in error) ? error.message : "Não foi possível concluir a operação no banco de dados.";
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BOT_IMAGE_MAX_BYTES, files: 1 } }).single("file");
async function validateImages(flow: Parameters<typeof botImageIds>[0], organizationId: string) {
  const ids = botImageIds(flow);
  if (!ids.length) return;
  const images = await prisma.botImage.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true } });
  if (images.length !== ids.length) throw new Error("Uma imagem não foi encontrada nesta empresa. Envie a foto novamente.");
}
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
  const image = botId === "images" && pathParts[2] && !req.activeOrganizationId
    ? await prisma.botImage.findUnique({ where: { id: pathParts[2] }, select: { organizationId: true } }) : null;
  const organizationId = req.activeOrganizationId || image?.organizationId || await resolveOrganization(req, ["images", "sac-test"].includes(botId ?? '') ? undefined : botId);
  if (!organizationId) return res.status(409).json({ message: "Não foi possível identificar a empresa do bot." });
  req.activeOrganizationId = organizationId;
  const member = await prisma.member.findUnique({ where: { organizationId_userId: { organizationId, userId: req.user!.id } } });
  if (!member || !["owner", "admin"].includes(member.role)) return res.status(403).json({ message: "Apenas administradores da empresa podem gerenciar bots." });
  next();
});

botRouter.post("/bots/images", (req, res) => {
  imageUpload(req, res, async error => {
    if (error) return res.status(error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: "Envie uma imagem JPEG, PNG ou WebP de até 5 MB." });
    const file = req.file;
    const mimetype = file && botImageMime(file.buffer);
    if (!file || !mimetype) return res.status(400).json({ message: "Arquivo inválido. Envie uma imagem JPEG, PNG ou WebP." });
    try {
      const image = await prisma.botImage.create({ data: { organizationId: req.activeOrganizationId!, data: new Uint8Array(file.buffer), mimetype, fileName: file.originalname.replace(/[\\/\r\n]/g, "_").slice(-255) || "imagem" }, select: { id: true, fileName: true, mimetype: true } });
      return res.status(201).json(image);
    } catch { return res.status(500).json({ message: "Não foi possível salvar a imagem." }); }
  });
});

botRouter.get("/bots/images/:imageId", async (req, res) => {
  const image = await prisma.botImage.findFirst({ where: { id: String(req.params.imageId), organizationId: req.activeOrganizationId! } });
  if (!image) return res.status(404).json({ message: "Imagem não encontrada." });
  res.set({ "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" }).type(image.mimetype).send(Buffer.from(image.data));
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
    await validateImages(req.body.draft, req.activeOrganizationId!);
    const name = req.body?.name;
    if (typeof name !== "string" || !name.trim() || name.length > 100) throw new Error("Informe um nome de até 100 caracteres.");
    res.status(201).json(await prisma.bot.create({ data: { organizationId: req.activeOrganizationId!, name: name.trim(), draft: json(req.body.draft) } }));
  } catch (error) { res.status(400).json({ message: errorMessage(error) }); }
});

// Resultados acessíveis somente a administradores da empresa do chamado.
botRouter.get('/bots/sac-test/tickets', async (req, res) => {
  try {
    res.json({ mode: 'TEST', tickets: await prisma.sacTestTicket.findMany({ where: { organizationId: req.activeOrganizationId! }, orderBy: { createdAt: 'desc' }, take: 100 }) });
  } catch { res.status(503).json({ message: 'Não foi possível consultar os chamados de teste. Verifique as migrations e o banco.' }); }
});

botRouter.put("/bots/:id", async (req, res) => {
  try {
    validateFlow(req.body?.draft);
    const { name, revision } = req.body;
    if (typeof name !== "string" || !name.trim() || name.length > 100 || !Number.isInteger(revision)) throw new Error("Nome ou revisão inválidos.");
    const organizationId = req.activeOrganizationId || await resolveBotOrganization(req, String(req.params.id));
    if (!organizationId) return res.status(403).json({ message: "Você não tem permissão para editar este bot." });
    await validateImages(req.body.draft, organizationId);
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
    await validateImages(bot.draft, organizationId);
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
    if (!Array.isArray(inputs) || inputs.length > 100 || inputs.some(v => typeof v !== "string" || v.length > 8000)) throw new Error("Simulação inválida (máximo 100 passos de 8000 caracteres).");
    const startMenuId: unknown = req.body?.startMenuId;
    if (startMenuId !== undefined && (typeof startMenuId !== "string" || !req.body.flow.menus.some((menu: { id: string }) => menu.id === startMenuId))) throw new Error("Menu inicial do teste inexistente.");
    // Only a menu ID may be chosen; status/history still come from server replay.
    const testFlow = startMenuId ? { ...req.body.flow, rootMenuId: startMenuId } : req.body.flow;
    let state: BotState | null = null;
    const messages: { role: string; text: string; imageId?: string; menuId?: string; optionId?: string }[] = [];
    const steps: { menuId: string; optionId?: string; status: string }[] = [];
    for (const input of ["", ...inputs]) {
      if (state && state.status !== "BOT_ACTIVE") break;
      const selectedOption = state && !state.sacTest && input.trim() !== "0" ? testFlow.menus.find((menu: { id: string }) => menu.id === state!.menuId)?.options.find((option: { active: boolean; number: string }) => option.active && option.number === input.trim()) : undefined;
      if (state) messages.push({ role: "user", text: input });
      const result = advanceBot(state ? req.body.flow : testFlow, state, input);
      // Reexecutar o histórico do simulador nunca grava nem envia mensagens reais.
      if (result.sacTestSubmission) result.text = '✅ Simulação concluída! Nenhum registro foi salvo e nenhum chamado foi aberto no SAC.\n\n0 — ↩️ Menu principal';
      state = result.state;
      const step = { menuId: state.menuId, status: state.status, ...(selectedOption ? { optionId: selectedOption.id } : {}) };
      steps.push(step);
      if (result.text || result.imageId) messages.push({ role: "bot", text: result.text, menuId: state.menuId, ...(selectedOption ? { optionId: selectedOption.id } : {}), ...(result.imageId ? { imageId: result.imageId } : {}) });
    }
    const ticket = state?.sacTest;
    const quickReplies = ticket ? ticket.cancelPending || ['confirmCnpj', 'review'].includes(ticket.step) ? ['1', '2', ...(ticket.cancelPending ? [] : ['0'])]
      : ticket.step === 'edit' ? ['1', '2', '3', '4', '5', '6', '7', '8', '0']
      : ['equipment', 'address'].includes(ticket.step) ? ['1', '0'] : ['0']
      : [...(req.body.flow.menus.find((menu: { id: string }) => menu.id === state?.menuId)?.options.filter((option: { active: boolean }) => option.active).map((option: { number: string }) => option.number) ?? []), '0'];
    res.json({ state, messages, steps, quickReplies });
  } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : "Simulação inválida." }); }
});
return botRouter;
}

export const botRouter = createBotRouter();
