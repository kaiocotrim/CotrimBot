import type { Message, UploadAttachment } from './types';

export function canReply(message: Message) { return !message.deletedAt && !message.private && message.type !== 'SYSTEM'; }
export function messagePreview(message: Pick<Message, 'content' | 'type' | 'deletedAt'>) {
  if (message.deletedAt) return 'Mensagem apagada';
  if (message.content?.trim() && !/^\[(imagem|image|figurinha|sticker|documento|document)\]$/i.test(message.content.trim())) return message.content;
  return ({ IMAGE: 'Imagem', STICKER: 'Figurinha', DOCUMENT: 'Documento', VIDEO: 'Vídeo', AUDIO: 'Áudio' } as Record<string, string>)[message.type] || 'Mensagem';
}

export function attachmentForm(file: UploadAttachment, caption: string, replyToMessageId?: number, form = new FormData()) {
  // React Native's FormData reads the local file from this descriptor.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  if (caption.trim()) form.append('caption', caption.trim());
  if (replyToMessageId !== undefined) form.append('replyToMessageId', String(replyToMessageId));
  form.append('includeSignature', 'true');
  return form;
}
