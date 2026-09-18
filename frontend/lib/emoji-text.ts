import emojiRegex from "emoji-regex";
import { emojiByUnified } from "emoji-picker-react";

type EmojiTextPart = { kind: "text"; value: string } | { kind: "emoji"; value: string; unified: string | null };

// selectionStart/End do textarea usam posições UTF-16, como slice e length.
export function insertEmojiAtSelection(content: string, emoji: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, content.length));
  const to = Math.max(from, Math.min(end, content.length));
  return { value: content.slice(0, from) + emoji + content.slice(to), caret: from + emoji.length };
}

// Reconhece sequências completas: tons de pele, bandeiras, famílias e teclas numéricas.
// O texto original é preservado; apenas a apresentação visual usa imagens.
export function splitEmojiText(content: string): EmojiTextPart[] {
  const parts: EmojiTextPart[] = [];
  let offset = 0;
  for (const match of content.matchAll(emojiRegex())) {
    const index = match.index;
    if (index > offset) parts.push({ kind: "text", value: content.slice(offset, index) });
    const value = match[0];
    const code = Array.from(value, (character) => character.codePointAt(0)!.toString(16).padStart(4, "0")).join("-");
    const withoutSelector = code.replace(/-fe0f/g, "");
    const unified = emojiByUnified(code) ? code : emojiByUnified(withoutSelector) ? withoutSelector : null;
    parts.push({ kind: "emoji", value, unified });
    offset = index + value.length;
  }
  if (offset < content.length) parts.push({ kind: "text", value: content.slice(offset) });
  return parts;
}
