import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { normalizePoll, type Poll, type PollVote } from "../utils/poll.js";
import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.js";

type RecordValue = Record<string, any>;
export function storedPoll(value: unknown): Poll | null {
  const poll = normalizePoll(value);
  if (!poll) return null;
  const raw = value as RecordValue;
  const votes: PollVote[] = Array.isArray(raw.votes) ? raw.votes.filter((vote: any) => (
    vote && typeof vote.voterId === "string" && typeof vote.updatedAt === "string"
    && Array.isArray(vote.optionIndexes) && vote.optionIndexes.every((index: unknown) => Number.isInteger(index) && Number(index) >= 0 && Number(index) < poll.options.length)
  )) : [];
  return { ...poll, votes };
}

function timestamp(value: unknown) {
  const long = typeof value === "object" && value !== null ? value as RecordValue : null;
  const raw = long ? (Number(long.low) >>> 0) + Number(long.high ?? 0) * 4294967296 : value;
  const number = Number(raw);
  const date = Number.isFinite(number) && number > 0 && number < 8.64e15 ? new Date(number < 1e12 ? number * 1000 : number) : new Date();
  return date.toISOString();
}

function optionIndex(value: unknown, options: string[]): number {
  if (typeof value === "string" && options.includes(value)) return options.indexOf(value);
  let hash: Buffer;
  if (typeof value === "string") hash = Buffer.from(value, /^[a-f\d]{64}$/i.test(value) ? "hex" : "base64");
  else if (Array.isArray(value)) hash = Buffer.from(value);
  else if (value && typeof value === "object") {
    const input = value as RecordValue;
    if (input.type === "Buffer" && Array.isArray(input.data)) hash = Buffer.from(input.data);
    else hash = Buffer.from(Object.keys(input).sort((a, b) => Number(a) - Number(b)).map((key) => input[key]));
  } else return -1;
  return options.findIndex((option) => createHash("sha256").update(option).digest().equals(hash));
}

export function pollVoteChanges(data: RecordValue, poll: Poll, ownJid?: string): PollVote[] {
  const update = data.message?.pollUpdateMessage;
  const selected = update?.vote?.selectedOptions;
  const updatedAt = timestamp(update?.senderTimestampMs ?? data.messageTimestamp ?? data.timestamp);
  if (Array.isArray(selected)) {
    const key = data.key ?? {};
    const voter = key.fromMe ? ownJid : key.participantAlt ?? key.participant ?? key.remoteJidAlt ?? key.remoteJid;
    if (typeof voter !== "string" || voter.endsWith("@g.us")) return [];
    const indexes = selected.map((option: unknown) => optionIndex(option, poll.options));
    // Encrypted or unknown options must never erase a previously recorded vote.
    if (indexes.some((index: number) => index < 0) || new Set(indexes).size > poll.selectableCount) return [];
    const aliases = (key.fromMe ? [ownJid] : [key.participant, key.participantAlt, ...(!key.participant ? [key.remoteJid, key.remoteJidAlt] : [])])
      .filter((jid): jid is string => typeof jid === "string" && !jid.endsWith("@g.us")).map(normalizeWhatsAppJid);
    const aggregates = Array.isArray(data.pollUpdates) ? data.pollUpdates : [];
    const knownVoters = [...new Set<string>(aggregates.flatMap((option: RecordValue) => Array.isArray(option.voters) ? option.voters.filter((jid: unknown) => typeof jid === "string") : []))];
    if (knownVoters.length === 1) aliases.push(normalizeWhatsAppJid(knownVoters[0]!));
    return [{ voterId: normalizeWhatsAppJid(voter), voterAliases: [...new Set(aliases)], voterName: typeof data.pushName === "string" ? data.pushName : null, optionIndexes: [...new Set<number>(indexes)], updatedAt }];
  }
  const aggregate = data.pollUpdates ?? data.update?.pollUpdates;
  if (!Array.isArray(aggregate)) return [];
  const byVoter = new Map<string, number[]>();
  for (const option of aggregate) {
    const index = poll.options.indexOf(option?.name);
    if (index < 0 || !Array.isArray(option.voters)) continue;
    for (const voter of option.voters) {
      if (typeof voter !== "string") continue;
      const jid = normalizeWhatsAppJid(voter);
      byVoter.set(jid, [...(byVoter.get(jid) ?? []), index]);
    }
  }
  return [...byVoter.entries()].map(([voterId, optionIndexes]) => ({ voterId, voterName: null, optionIndexes: [...new Set(optionIndexes)], updatedAt }));
}

export function mergePollVotes(poll: Poll, changes: PollVote[]): Poll {
  const votes = new Map((poll.votes ?? []).map((vote) => [vote.voterId, vote]));
  for (const change of changes) {
    const aliases = new Set([change.voterId, ...(change.voterAliases ?? [])]);
    const current = [...votes.values()].find((vote) => [vote.voterId, ...(vote.voterAliases ?? [])].some((id) => aliases.has(id)));
    if (current && current.updatedAt > change.updatedAt) continue;
    const voterId = current?.voterId ?? change.voterId;
    const voterAliases = [...new Set([voterId, ...(current?.voterAliases ?? []), ...aliases])];
    votes.set(voterId, { ...change, voterId, voterAliases, voterName: change.voterName ?? current?.voterName ?? null });
  }
  return { ...poll, votes: [...votes.values()] };
}

export function createPollResultsService(
  database: Pick<typeof prisma, "message"> = prisma,
  emit: (payload: { messageId: number; poll: Poll }) => void = (payload) => { getSocketServer().emit("poll_updated", payload); },
) {
  async function apply(externalId: string, changes: (poll: Poll) => PollVote[]) {
    // Compare-and-swap preserves simultaneous votes from different people.
    for (let attempt = 0; attempt < 5; attempt++) {
      const message = await database.message.findUnique({ where: { externalId } });
      if (!message || message.type !== "POLL" || message.deletedAt) return null;
      const current = storedPoll(message.poll);
      if (!current) return null;
      const delta = changes(current);
      if (!delta.length) return current;
      const poll = mergePollVotes(current, delta);
      if (JSON.stringify(current) === JSON.stringify(poll)) return poll;
      const updated = await database.message.updateMany({
        where: { id: message.id, deletedAt: null, poll: { equals: message.poll as Prisma.InputJsonValue } },
        data: { poll: poll as Prisma.InputJsonValue },
      });
      if (!updated.count) continue;
      emit({ messageId: message.id, poll });
      return poll;
    }
    throw new Error("Não foi possível atualizar os votos da enquete.");
  }
  return { apply, receive: async (data: RecordValue, ownJid?: string) => {
    const externalId = data.message?.pollUpdateMessage?.pollCreationMessageKey?.id ?? data.keyId ?? data.key?.id ?? data.id;
    if (typeof externalId !== "string") return null;
    return apply(externalId, (poll) => pollVoteChanges(data, poll, ownJid));
  } };
}

export const pollResults = createPollResultsService();
