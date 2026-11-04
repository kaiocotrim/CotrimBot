import type { Message } from './types';

function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }

export function findMessages(messages: Message[], query: string) {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return messages;
  return messages.filter(message => !message.deletedAt && message.type !== 'SYSTEM' && terms.every(term => normalize(message.content).includes(term)));
}
