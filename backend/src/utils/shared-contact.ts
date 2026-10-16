import { unwrapWhatsAppMessage, type WhatsAppMessagePayload } from "./whatsapp-message.js";

export type SharedContact = { name: string; phone: string };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unescapeText = (value: string) => value.replace(/\\([nN,;\\])/g, (_, character: string) => /n/i.test(character) ? " " : character).trim();

// Only retain names and telephone numbers, never embedded photos or other vCard data.
export function extractSharedContacts(payload: WhatsAppMessagePayload): SharedContact[] {
  const message = unwrapWhatsAppMessage(payload);
  const array = record(message.contactsArrayMessage) ? message.contactsArrayMessage.contacts : null;
  const cards = record(message.contactMessage) ? [message.contactMessage] : Array.isArray(array) ? array : [];
  const contacts = new Map<string, SharedContact>();
  for (const card of cards.slice(0, 100)) {
    if (!record(card) || typeof card.vcard !== "string" || card.vcard.length > 65_536) continue;
    const lines = card.vcard.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    const fullName = lines.find((line) => /^(?:[^:;.]+\.)?FN(?:;[^:]*)?:/i.test(line));
    const name = unescapeText(fullName?.slice(fullName.indexOf(":") + 1) || (typeof card.displayName === "string" ? card.displayName : "")).slice(0, 191);
    for (const line of lines) {
      if (!/^(?:[^:;.]+\.)?TEL(?:;[^:]*)?:/i.test(line)) continue;
      const separator = line.indexOf(":");
      const waid = /;waid="?(\d+)/i.exec(line.slice(0, separator))?.[1];
      const value = line.slice(separator + 1).replace(/^tel:/i, "").split(/;ext=/i)[0] ?? "";
      const phone = (waid ?? value).replace(/\D/g, "");
      if (!/^\d{7,15}$/.test(phone)) continue;
      contacts.set(phone, { name: name || `+${phone}`, phone });
      if (contacts.size >= 100) return [...contacts.values()];
    }
  }
  return [...contacts.values()];
}
