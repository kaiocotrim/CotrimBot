import { File, Paths } from 'expo-file-system';
import type { Api } from './api';
import type { Message } from './types';
import { messageActions, messageActionText } from './message-actions';

export async function forwardMessage(api: Api, message: Message, targetId: number) {
  if (!messageActions(message).forward) throw new Error('Essa mensagem não pode ser encaminhada.');
  if (message.type === 'POLL' && message.poll) return api.sendPoll(targetId, message.poll);
  if (!['IMAGE', 'STICKER', 'AUDIO', 'VIDEO', 'DOCUMENT'].includes(message.type)) {
    return api.send(targetId, messageActionText(message), undefined, { includeSignature: false });
  }
  const response = await api.fetch(`/messages/${message.id}/media`, {}, 60000);
  const blob = await response.blob();
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || blob.type || 'application/octet-stream';
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
  const headerName = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  const name = (headerName || `mensagem-${message.id}.${extensions[mimeType] ?? 'bin'}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160);
  const file = new File(Paths.cache, `forward-${Date.now()}-${name}`);
  try {
    file.create(); file.write(new Uint8Array(await blob.arrayBuffer()));
    return await api.sendMedia(targetId, { uri: file.uri, name, mimeType, size: file.size }, messageActionText(message), undefined, false);
  } finally { try { if (file.exists) file.delete(); } catch {} }
}
