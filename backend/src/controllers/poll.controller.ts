import type { Request, Response } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { getProfilePicture, sendWhatsAppPoll } from "../services/evolution.service.js";
import { contactDisplayName } from "../utils/contact-name.js";
import { normalizePoll, pollSummary } from "../utils/poll.js";
import { pollResults, storedPoll } from "../services/poll-results.service.js";
import { getWhatsAppPollIdentity, getWhatsAppPollVotes, sendWhatsAppPollVote } from "../services/evolution-polls.service.js";
import { whatsAppJidIdentifier } from "../utils/whatsapp-jid.js";
import { emitOrganizationWebhookEvent } from "../services/organization-webhook.service.js";
import { resolveRequestOrganizationId } from "../middlewares/auth.middleware.js";

export function createSendPollHandler(
  database: Pick<typeof prisma, "contact" | "message"> = prisma,
  send = sendWhatsAppPoll,
  emit: (payload: unknown) => void = (payload) => { getSocketServer().emit("new_message", payload); },
  notify: (organizationId: string, payload: Record<string, unknown>) => void = (organizationId, payload) => emitOrganizationWebhookEvent(prisma, organizationId, "poll.created", payload),
  resolveOrganizationId: (req: Request) => Promise<string | null> = (req) => resolveRequestOrganizationId(prisma, req),
) {
  return async function sendPoll(req: Request, res: Response) {
    const contactId = Number(req.params.id);
    const poll = normalizePoll(req.body);
    if (!Number.isSafeInteger(contactId) || contactId <= 0 || !poll) {
      return res.status(400).json({ message: "Informe uma pergunta e de 2 a 12 opções diferentes para a enquete." });
    }
    const contact = await database.contact.findUnique({ where: { id: contactId } });
    if (!contact) return res.status(404).json({ message: "Contato não encontrado" });
    try {
      const result = await send(contact.phone, poll);
      const externalId = result?.key?.id;
      if (typeof externalId !== "string" || !externalId) throw new Error("A Evolution não retornou o identificador da enquete");
      const organizationId = await resolveOrganizationId(req);
      const data = { content: pollSummary(poll), type: "POLL" as const, poll, sentByUserId: req.user!.id, organizationId };
      const message = await database.message.upsert({
        where: { externalId }, update: data,
        create: { ...data, externalId, direction: "OUTGOING", contactId },
        include: { sentByUser: { select: { id: true, name: true, image: true } } },
      });
      emit({ message, contact: { ...contact, name: contactDisplayName(contact) } });
      if (organizationId) notify(organizationId, { messageId: message.id, contactId, question: poll.question, options: poll.options, selectableCount: poll.selectableCount });
      else console.log("[webhooks] enquete enviada sem empresa ativa; poll.created nao emitido");
      return res.status(201).json({ message });
    } catch (error) {
      console.error("Erro ao enviar enquete:", error);
      return res.status(502).json({ message: "Não foi possível enviar a enquete. Tente novamente." });
    }
  };
}

export const sendPoll = createSendPollHandler();

export function createPollInteractionHandlers(
  database: Pick<typeof prisma, "message" | "contact"> = prisma,
  sendVote = sendWhatsAppPollVote,
  results = pollResults,
  getIdentity = getWhatsAppPollIdentity,
  getVotes = getWhatsAppPollVotes,
  getPicture = getProfilePicture,
  emit: (payload: unknown) => void = (payload) => { getSocketServer().emit("poll_updated", payload); },
  notifyClosed: (organizationId: string, payload: Record<string, unknown>) => void = (organizationId, payload) => emitOrganizationWebhookEvent(prisma, organizationId, "poll.closed", payload),
) {
  const synchronization = new Map<number, { at: number; promise: Promise<void> }>();
  async function synchronizePoll(message: { id: number; externalId: string; contact: { phone: string } }, ownJid?: string) {
    const previous = synchronization.get(message.id);
    if (previous && Date.now() - previous.at < 10_000) return previous.promise;
    const promise = (async () => {
      const updates = await getVotes(message.contact.phone);
      for (const update of updates.reverse()) {
        if (update.message?.pollUpdateMessage?.pollCreationMessageKey?.id === message.externalId) await results.receive(update, ownJid);
      }
    })();
    synchronization.set(message.id, { at: Date.now(), promise });
    if (synchronization.size > 100) synchronization.delete(synchronization.keys().next().value!);
    try { await promise; } catch (error) { synchronization.delete(message.id); throw error; }
  }

  async function visiblePoll(messageId: number, userId: string) {
    return database.message.findFirst({ where: { id: messageId, type: "POLL", private: false, deletedAt: null, deletions: { none: { userId } } }, include: { contact: true } });
  }

  async function getPollResults(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Enquete inválida" });
    const message = await visiblePoll(id, req.user!.id);
    if (!message) return res.status(404).json({ message: "Enquete não encontrada" });
    let ownVoterIds: string[] = [];
    let syncError: string | null = null;
    try { ownVoterIds = await getIdentity(); await synchronizePoll(message, ownVoterIds[0]); }
    catch { syncError = "Não foi possível atualizar os votos do WhatsApp agora."; }
    const updated = await visiblePoll(id, req.user!.id);
    const poll = storedPoll(updated?.poll);
    if (!poll) return res.status(404).json({ message: "Enquete não encontrada" });
    const votes = poll.votes ?? [];
    const contacts = votes.length ? await database.contact.findMany({
      where: { OR: [{ phone: { in: votes.map((vote) => whatsAppJidIdentifier(vote.voterId)) } }, { whatsappLid: { in: votes.map((vote) => vote.voterId) } }] },
      select: { phone: true, whatsappLid: true, name: true, isSaved: true, isGroup: true, profilePictureUrl: true },
    }) : [];
    return res.json({ poll: { ...poll, votes: votes.map((vote) => {
      const contact = contacts.find((item) => item.phone === whatsAppJidIdentifier(vote.voterId) || item.whatsappLid === vote.voterId);
      return { ...vote, voterName: contact?.isSaved ? contact.name : vote.voterName ?? (contact ? contactDisplayName(contact) : null), voterProfilePictureUrl: contact?.profilePictureUrl ?? null };
    }) }, ownVoterIds, syncError });
  }

  async function getPollVoterAvatar(req: Request, res: Response) {
    const id = Number(req.params.id);
    const voterId = req.query.voterId;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof voterId !== "string") return res.status(400).json({ message: "Participante inválido" });
    const message = await visiblePoll(id, req.user!.id);
    const vote = storedPoll(message?.poll)?.votes?.find((item) => item.voterId === voterId && item.optionIndexes.length > 0);
    if (!message || !vote) return res.status(404).json({ message: "Participante não encontrado" });
    const jids = [vote.voterId, ...(vote.voterAliases ?? [])];
    const identifiers = jids.map(whatsAppJidIdentifier);
    const contact = await database.contact.findFirst({
      where: { isGroup: false, OR: [{ phone: { in: identifiers } }, { whatsappLid: { in: jids } }] },
      select: { id: true, phone: true, profilePictureUrl: true },
    });
    if (contact?.profilePictureUrl) return res.json({ profilePictureUrl: contact.profilePictureUrl });
    const cached = await database.message.findFirst({
      where: { senderPhone: { in: [...identifiers, ...jids] }, senderProfilePictureUrl: { not: null } },
      select: { senderProfilePictureUrl: true },
    });
    if (cached?.senderProfilePictureUrl) return res.json({ profilePictureUrl: cached.senderProfilePictureUrl });
    try {
      const profile = await getPicture(contact?.phone ?? jids.find((jid) => jid.endsWith("@s.whatsapp.net")) ?? voterId);
      if (contact && profile.profilePictureUrl) await database.contact.update({ where: { id: contact.id }, data: { profilePictureUrl: profile.profilePictureUrl } });
      return res.json({ profilePictureUrl: profile.profilePictureUrl ?? null });
    } catch {
      return res.json({ profilePictureUrl: null });
    }
  }

  async function voteOnPoll(req: Request, res: Response) {
    const id = Number(req.params.id);
    const indexes = req.body?.optionIndexes;
    if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(indexes) || indexes.some((value) => !Number.isInteger(value))) {
      return res.status(400).json({ message: "Voto inválido" });
    }
    const message = await visiblePoll(id, req.user!.id);
    const poll = storedPoll(message?.poll);
    if (!message || !poll) return res.status(404).json({ message: "Enquete não encontrada" });
    if (poll.closedAt) return res.status(409).json({ message: "Esta enquete foi encerrada." });
    if (new Set(indexes).size !== indexes.length || indexes.length > poll.selectableCount || indexes.some((index) => index < 0 || index >= poll.options.length)) {
      return res.status(400).json({ message: "Selecione opções válidas para esta enquete." });
    }
    try {
      const confirmed = await sendVote(message.contact.phone, message.externalId, indexes);
      const updated = await results.apply(message.externalId, () => [{
        voterId: confirmed.voterId, voterName: confirmed.voterName, optionIndexes: indexes, updatedAt: new Date(confirmed.timestamp).toISOString(),
      }]);
      if (!updated) return res.status(410).json({ message: "Esta enquete não está mais disponível." });
      return res.json({ poll: updated, ownVoterIds: [confirmed.voterId] });
    } catch (error) {
      return res.status(502).json({ message: error instanceof Error ? error.message : "Não foi possível enviar seu voto." });
    }
  }

  async function closePoll(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Enquete inválida" });
    const message = await visiblePoll(id, req.user!.id);
    const poll = storedPoll(message?.poll);
    if (!message || !poll) return res.status(404).json({ message: "Enquete não encontrada" });
    if (poll.closedAt) return res.json({ poll });
    const closed = { ...poll, closedAt: new Date().toISOString() };
    // Só encerra se a enquete não tiver sido alterada (votos) desde a leitura.
    const updated = await database.message.updateMany({
      where: { id, deletedAt: null, poll: { equals: message.poll as Prisma.InputJsonValue } },
      data: { poll: closed as Prisma.InputJsonValue },
    });
    if (!updated.count) return res.status(409).json({ message: "A enquete foi alterada. Tente novamente." });
    emit({ messageId: id, poll: closed });
    if (message.organizationId) notifyClosed(message.organizationId, { messageId: id, contactId: message.contactId, question: closed.question, closedAt: closed.closedAt });
    else console.log(`[webhooks] enquete ${id} encerrada sem organizationId; poll.closed nao emitido`);
    return res.json({ poll: closed });
  }

  return { getPollResults, getPollVoterAvatar, voteOnPoll, closePoll };
}

export const { getPollResults, getPollVoterAvatar, voteOnPoll, closePoll } = createPollInteractionHandlers();
