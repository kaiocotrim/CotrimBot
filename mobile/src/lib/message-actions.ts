import type { Message } from './types';

export function messageActionText(message: Message) {
  if (message.deletedAt || message.type === 'SYSTEM') return '';
  const text = message.content?.trim() ?? '';
  return /^\[(áudio|audio|imagem|image|foto|figurinha|sticker|vídeo|video|documento|document)\]$/i.test(text) ? '' : text;
}

export function messageActions(message: Message) {
  const available = !message.deletedAt && message.type !== 'SYSTEM';
  const text = messageActionText(message);
  return {
    reply: available && !message.private,
    copy: available && !!text,
    translate: available && !!text && text.length <= 10000,
    react: available && !message.private,
    forward: available && !message.private && (!!text || ['IMAGE', 'STICKER', 'AUDIO', 'VIDEO', 'DOCUMENT'].includes(message.type) || !!message.poll),
    flags: available,
    delete: message.type !== 'SYSTEM',
  };
}
