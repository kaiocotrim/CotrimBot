import type { GroupParticipant } from "@/lib/chat-api";
import type { Contact, Message } from "@/types/chat";

export type MentionTarget = { name: string; identity: string };

export function mentionIdentifier(value?: string | null) {
  return value?.split("@")[0].split(":")[0].replace(/\D/g, "") ?? "";
}

export function buildGroupMentions(contacts: Contact[], participants: GroupParticipant[], messages: Message[]) {
  const result = new Map<string, MentionTarget>();
  const aliases = new Map<string, string[]>();
  for (const participant of participants) {
    const identifiers = [mentionIdentifier(participant.phone), mentionIdentifier(participant.lid)].filter(Boolean);
    for (const identifier of identifiers) aliases.set(identifier, identifiers);
  }
  function add(identifiers: string[], name?: string | null) {
    const cleaned = name?.trim();
    if (!cleaned || cleaned === "Participante" || /^\+?[\d\s().:-]+(?:@(?:lid|s\.whatsapp\.net))?$/.test(cleaned)) return;
    const expanded = new Set(identifiers.flatMap((identifier) => aliases.get(identifier) ?? [identifier]).filter(Boolean));
    const identity = expanded.values().next().value;
    if (!identity) return;
    for (const identifier of expanded) result.set(identifier, { name: cleaned, identity });
  }
  // Saved names take precedence over WhatsApp push names. Participant aliases
  // map both phone numbers and LIDs to the same displayed identity.
  const personContacts = contacts.filter((item) => !item.isGroup);
  for (const contact of personContacts.filter((item) => !item.isSaved)) {
    add([mentionIdentifier(contact.phone), mentionIdentifier(contact.whatsappLid)], contact.name);
  }
  for (const message of messages) add([mentionIdentifier(message.senderPhone)], message.senderName);
  for (const participant of participants) add([mentionIdentifier(participant.phone), mentionIdentifier(participant.lid)], participant.name);
  for (const contact of personContacts.filter((item) => item.isSaved)) {
    add([mentionIdentifier(contact.phone), mentionIdentifier(contact.whatsappLid)], contact.name);
  }
  return result;
}
