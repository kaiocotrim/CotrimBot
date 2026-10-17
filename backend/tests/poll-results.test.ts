import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createDecipheriv, createHmac } from "node:crypto";
import type { Request, Response } from "express";
import type { prisma } from "../src/lib/prisma.js";
import { createPollResultsService, mergePollVotes, pollVoteChanges } from "../src/services/poll-results.service.js";
import { createPollInteractionHandlers } from "../src/controllers/poll.controller.js";
import { encryptNativePollVote, sendNativePollVote } from "../../evolution-polls/native-poll-vote.js";

const poll = { question: "Horário?", options: ["Manhã", "Tarde"], selectableCount: 2 };
const vote = (id: string, optionIndexes: number[], time = "2026-10-16T21:00:00.000Z") => ({ voterId: id, voterName: null, optionIndexes, updatedAt: time });

test("native payloads decode names and hashes, normalize devices, track multi-choice and vote withdrawal", () => {
  const raw = { key: { participant: "5511999999999:2@s.whatsapp.net", remoteJid: "group@g.us" }, pushName: "Ana", message: { pollUpdateMessage: { senderTimestampMs: 1792184400000, vote: { selectedOptions: ["Manhã", createHash("sha256").update("Tarde").digest().toJSON()] } } } };
  const delta = pollVoteChanges(raw, poll);
  assert.equal(delta[0]!.voterId, "5511999999999@s.whatsapp.net");
  assert.deepEqual(delta[0]!.optionIndexes, [0, 1]);
  assert.equal(delta[0]!.voterName, "Ana");
  const one = mergePollVotes(poll, delta);
  const two = mergePollVotes(one, [vote("other@s.whatsapp.net", [1])]);
  assert.equal(two.votes!.length, 2);
  const withdrawn = mergePollVotes(two, [vote(delta[0]!.voterId, [], "2099-01-01T00:00:00.000Z")]);
  assert.deepEqual(withdrawn.votes!.find((item) => item.voterId === delta[0]!.voterId)!.optionIndexes, []);
  assert.equal(withdrawn.votes!.find((item) => item.voterId === "other@s.whatsapp.net")!.optionIndexes.length, 1);
  assert.deepEqual(mergePollVotes(withdrawn, delta), withdrawn);
  const aggregated = pollVoteChanges({ keyId: "poll-id", timestamp: 1792184400, pollUpdates: [{ name: "Manhã", voters: ["alice@s.whatsapp.net"] }, { name: "Tarde", voters: ["alice@s.whatsapp.net", "bob@s.whatsapp.net"] }] }, poll);
  assert.deepEqual(aggregated[0]!.optionIndexes, [0, 1]);
  assert.equal(aggregated.length, 2);
  assert.deepEqual(pollVoteChanges({ ...raw, message: { pollUpdateMessage: { vote: { selectedOptions: ["unknown"] } } } }, poll), []);
  const lidVote = mergePollVotes(poll, [vote("123@lid", [0])]);
  const aliased = mergePollVotes(lidVote, [{ ...vote("5511999999999@s.whatsapp.net", []), voterAliases: ["123@lid"] }]);
  assert.equal(aliased.votes!.length, 1);
  assert.deepEqual(aliased.votes![0]!.optionIndexes, []);
});

test("compare-and-swap retries preserve simultaneous votes and duplicate events", async () => {
  let current: any = { id: 7, externalId: "poll-id", type: "POLL", deletedAt: null, poll };
  const events: unknown[] = [];
  const database = { message: {
    findUnique: async () => structuredClone(current),
    updateMany: async (query: any) => {
      if (JSON.stringify(current.poll) !== JSON.stringify(query.where.poll.equals)) return { count: 0 };
      current = { ...current, poll: query.data.poll };
      return { count: 1 };
    },
  } } as unknown as Pick<typeof prisma, "message">;
  const service = createPollResultsService(database, (event) => { events.push(event); });
  await Promise.all([service.apply("poll-id", () => [vote("a@s.whatsapp.net", [0])]), service.apply("poll-id", () => [vote("b@s.whatsapp.net", [1])])]);
  assert.equal(current.poll.votes.length, 2);
  await service.apply("poll-id", () => [vote("b@s.whatsapp.net", [1])]);
  assert.equal(events.length, 2);
  current.deletedAt = new Date();
  assert.equal(await service.apply("poll-id", () => [vote("c", [0])]), null);
});

test("native voting uses authenticated message visibility and persists only a confirmed WhatsApp vote", async () => {
  const record = { id: 7, externalId: "poll-id", type: "POLL", poll, contact: { phone: "5511999999999" } };
  const queries: any[] = [], saves: any[] = [], sent: any[] = [];
  let fail = false;
  const database = { message: { findFirst: async (query: any) => { queries.push(query); return record; } } } as unknown as Pick<typeof prisma, "message" | "contact">;
  const results = { receive: async () => null, apply: async (_id: string, get: any) => { const changes = get(poll); saves.push(changes); return mergePollVotes(poll, changes); } };
  const handler = createPollInteractionHandlers(database, async (...args) => {
    sent.push(args);
    if (fail) throw new Error("A integração precisa ser atualizada.");
    return { voterId: "own@s.whatsapp.net", voterName: "Conta", timestamp: Date.now() };
  }, results, async () => [], async () => []);
  async function run(optionIndexes: unknown) {
    const response = { code: 200, body: {} as any, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await handler.voteOnPoll({ params: { id: "7" }, body: { optionIndexes }, user: { id: "user" } } as unknown as Request, response as unknown as Response);
    return response;
  }
  assert.equal((await run([0, 1])).code, 200);
  assert.deepEqual(queries[0].where.deletions, { none: { userId: "user" } });
  assert.equal(queries[0].where.private, false);
  assert.equal(saves.length, 1);
  assert.equal((await run([2])).code, 400);
  assert.equal((await run([0, 0])).code, 400);
  assert.equal(sent.length, 1);
  fail = true;
  assert.equal((await run([1])).code, 502);
  assert.equal(saves.length, 1);
});

test("poll encryption matches the native AES-GCM derivation and authenticates the voting identity", () => {
  const secret = Buffer.alloc(32, 7), plaintext = Buffer.from("protobuf vote"), id = "poll-id", creator = "creator@s.whatsapp.net", voter = "voter@s.whatsapp.net";
  const encrypted = encryptNativePollVote(plaintext, secret, id, creator, voter, Buffer.alloc(12, 3));
  const key0 = createHmac("sha256", Buffer.alloc(32)).update(secret).digest();
  const key = createHmac("sha256", key0).update(Buffer.concat([Buffer.from(id + creator + voter + "Poll Vote"), Buffer.from([1])])).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.encIv);
  decipher.setAAD(Buffer.from(`${id}\0${voter}`));
  decipher.setAuthTag(encrypted.encPayload.subarray(-16));
  assert.deepEqual(Buffer.concat([decipher.update(encrypted.encPayload.subarray(0, -16)), decipher.final()]), plaintext);
});

test("the Evolution extension validates chat ownership and relays real pollUpdateMessage payloads", async () => {
  const original = { key: { id: "poll-id", remoteJid: "5511999999999@s.whatsapp.net", fromMe: true }, message: { messageContextInfo: { messageSecret: Buffer.alloc(32, 8).toString("base64") }, pollCreationMessageV3: { options: [{ optionName: "Manhã" }, { optionName: "Tarde" }], selectableOptionsCount: 2 } } };
  const relayed: any[] = [], emitted: any[] = [];
  const channel = { getMessage: async () => original, client: { user: { id: "5511888888888:4@s.whatsapp.net", name: "Conta" }, relayMessage: async (...args: any[]) => { relayed.push(args); }, ev: { emit: (...args: any[]) => emitted.push(args) } } };
  const sdk = { jidNormalizedUser: (jid: string) => jid.replace(/:\d+@/, "@"), proto: { Message: { PollVoteMessage: { encode: ({ selectedOptions }: any) => ({ finish: () => Buffer.concat(selectedOptions) }) } } }, generateWAMessageFromContent: (remoteJid: string, message: any) => ({ key: { id: "vote-id", remoteJid, fromMe: true }, message }) };
  const result = await sendNativePollVote(channel, { number: "5511999999999", messageId: "poll-id", optionIndexes: [0] }, sdk);
  assert.equal(result.voterId, "5511888888888@s.whatsapp.net");
  assert.equal(relayed[0][1].pollUpdateMessage.pollCreationMessageKey.id, "poll-id");
  assert.equal(relayed[0][1].pollUpdateMessage.vote.encIv.length, 12);
  assert.equal(emitted[0][0], "messages.upsert");
  await assert.rejects(sendNativePollVote(channel, { number: "other", messageId: "poll-id", optionIndexes: [0] }, sdk));
  await assert.rejects(sendNativePollVote(channel, { number: "5511999999999", messageId: "poll-id", optionIndexes: [5] }, sdk));
  assert.equal(relayed.length, 1);
});
