import { createHash } from "node:crypto";

export const companyKey = (name: string) => name.trim().normalize("NFC").toLocaleLowerCase("pt-BR");

type Candidate = { id: number; name: string; phone: string; companyName: string | null; blocked: boolean; isGroup: boolean };

// O vínculo atual dos contatos é pelo nome da empresa. Não inferimos outro vínculo.
export function announcementRecipients(companyName: string, contacts: Candidate[]) {
  const seen = new Set<string>();
  const recipients: { id: number; name: string; phone: string }[] = [];
  let excluded = 0;
  for (const contact of [...contacts].sort((a, b) => a.id - b.id)) {
    if (companyKey(contact.companyName ?? "") !== companyKey(companyName)) continue;
    const phone = contact.phone.replace(/\D/g, "");
    if (contact.blocked || contact.isGroup || !/^\d{12,15}$/.test(phone) || seen.has(phone)) {
      excluded++;
      continue;
    }
    seen.add(phone);
    recipients.push({ id: contact.id, name: contact.name, phone });
  }
  return { recipients, excluded };
}

// A confirmação só vale para o texto e os destinatários efetivamente revisados.
export function announcementPreviewToken(clientId: string, content: string, recipients: { id: number; name: string; phone: string }[]) {
  return createHash("sha256").update(JSON.stringify({ clientId, content, recipients })).digest("hex");
}
