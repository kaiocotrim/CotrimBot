import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

function bytes(value: any): Buffer {
  if (typeof value === 'string') return Buffer.from(value, 'base64');
  if (value?.type === 'Buffer') return Buffer.from(value.data);
  if (value && !Array.isArray(value) && !(value instanceof Uint8Array)) return Buffer.from(Object.values(value));
  return Buffer.from(value ?? []);
}

export function encryptNativePollVote(plaintext: Uint8Array, secret: Buffer, pollId: string, creator: string, voter: string, iv = randomBytes(12)) {
  const key0 = createHmac('sha256', Buffer.alloc(32)).update(secret).digest();
  const sign = Buffer.concat([Buffer.from(pollId), Buffer.from(creator), Buffer.from(voter), Buffer.from('Poll Vote'), Buffer.from([1])]);
  const key = createHmac('sha256', key0).update(sign).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${pollId}\0${voter}`));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { encPayload: encrypted, encIv: iv };
}

export async function sendNativePollVote(channel: any, input: any, sdk: any) {
  if (!channel?.client?.user?.id || typeof input?.number !== 'string' || typeof input?.messageId !== 'string'
    || !input.messageId || !Array.isArray(input.optionIndexes)) throw new Error('Invalid poll vote');
  const original = await channel.getMessage({ id: input.messageId }, true);
  const key = original?.key;
  const remoteJid = input.number.includes('@') ? input.number : `${input.number.replace(/\D/g, '')}@s.whatsapp.net`;
  if (!key?.id || ![key.remoteJid, key.remoteJidAlt].filter(Boolean).some((jid) => sdk.jidNormalizedUser(jid) === sdk.jidNormalizedUser(remoteJid))) throw new Error('Poll not found in this chat');
  const content = original.message;
  const poll = content?.pollCreationMessageV3 ?? content?.pollCreationMessageV2 ?? content?.pollCreationMessage;
  const indexes: number[] = input.optionIndexes;
  const maximum = poll?.selectableOptionsCount || poll?.options?.length;
  if (!poll?.options?.length || indexes.length > maximum || new Set(indexes).size !== indexes.length
    || indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= poll.options.length)) throw new Error('Invalid poll options');
  const secret = bytes(content.messageContextInfo?.messageSecret);
  if (secret.length !== 32) throw new Error('Poll encryption key unavailable');
  const client = channel.client;
  const ownPhone = sdk.jidNormalizedUser(client.user.id);
  const creator = sdk.jidNormalizedUser(key.fromMe
    ? key.participant ?? (key.addressingMode === 'lid' && client.user.lid ? client.user.lid : ownPhone)
    : key.participant ?? key.remoteJid);
  const voterId = creator.endsWith('@lid') && client.user.lid ? sdk.jidNormalizedUser(client.user.lid) : ownPhone;
  const selectedOptions = indexes.map((index) => createHash('sha256').update(poll.options[index].optionName).digest()).sort(Buffer.compare);
  const plaintext = sdk.proto.Message.PollVoteMessage.encode({ selectedOptions }).finish();
  const timestamp = Date.now();
  const vote = encryptNativePollVote(plaintext, secret, key.id, creator, voterId);
  const message = sdk.generateWAMessageFromContent(key.remoteJid, {
    pollUpdateMessage: { pollCreationMessageKey: key, vote, senderTimestampMs: timestamp },
  }, { userJid: client.user.id });
  await client.relayMessage(key.remoteJid, message.message, { messageId: message.key.id });
  // The same native event path persists the vote and synchronizes linked devices.
  client.ev.emit('messages.upsert', { messages: [message], type: 'append' });
  return { voterId, voterName: client.user.name ?? null, timestamp, key: message.key };
}
