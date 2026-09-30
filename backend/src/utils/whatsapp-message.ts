export type WhatsAppMessagePayload = Record<string, unknown>;
type ContextInfo = Record<string, unknown> & { quotedMessage: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasQuotedMessage(value: unknown): value is ContextInfo {
  return isRecord(value) && isRecord(value.quotedMessage);
}

export function unwrapWhatsAppMessage(message: WhatsAppMessagePayload | null | undefined): WhatsAppMessagePayload {
  let current = message ?? {};
  for (let depth = 0; depth < 5; depth += 1) {
    const wrapper = (current.ephemeralMessage
      ?? current.viewOnceMessage
      ?? current.viewOnceMessageV2
      ?? current.viewOnceMessageV2Extension
      ?? current.documentWithCaptionMessage) as { message?: WhatsAppMessagePayload } | undefined;
    if (!wrapper?.message) break;
    current = wrapper.message;
  }
  return current;
}

export function findReplyContextInfo(
  message: WhatsAppMessagePayload,
  dataContextInfo?: Record<string, unknown>,
): ContextInfo | undefined {
  const candidates = [
    message.extendedTextMessage,
    message.imageMessage,
    message.videoMessage,
    message.audioMessage,
    message.documentMessage,
    message.stickerMessage,
  ] as Array<{ contextInfo?: Record<string, unknown> } | undefined>;

  const directContext = candidates
    .map((candidate) => candidate?.contextInfo)
    .find(hasQuotedMessage);
  if (directContext) return directContext;

  // Wrappers variam entre versões do Baileys. A busca é limitada e só aceita
  // um contexto que contenha quotedMessage; stanzaId ou metadados genéricos
  // nunca transformam uma mensagem normal em resposta.
  const visited = new Set<object>();
  function findContext(value: unknown, depth: number): ContextInfo | undefined {
    if (!isRecord(value) || depth > 6 || visited.has(value)) return undefined;
    visited.add(value);
    if (hasQuotedMessage(value)) return value;
    for (const nested of Object.values(value)) {
      const found = findContext(nested, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  return findContext(message, 0)
    ?? (hasQuotedMessage(dataContextInfo) ? dataContextInfo : undefined);
}

export function getQuotedContent(message: unknown): string | null {
  const quoted = unwrapWhatsAppMessage(message as WhatsAppMessagePayload | null | undefined);
  const text = quoted.conversation
    ?? (quoted.extendedTextMessage as { text?: unknown } | undefined)?.text
    ?? (quoted.imageMessage as { caption?: unknown } | undefined)?.caption
    ?? (quoted.videoMessage as { caption?: unknown } | undefined)?.caption
    ?? (quoted.documentMessage as { fileName?: unknown } | undefined)?.fileName;

  if (typeof text === "string" && text.trim()) return text.trim();
  if (quoted.audioMessage) return "[Áudio]";
  if (quoted.imageMessage) return "[Imagem]";
  if (quoted.videoMessage) return "[Vídeo]";
  if (quoted.documentMessage) return "[Documento]";
  if (quoted.stickerMessage) return "[Figurinha]";
  return null;
}
