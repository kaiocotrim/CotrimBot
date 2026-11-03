import type { prisma } from "../lib/prisma.js";
import { contactDisplayName } from "../utils/contact-name.js";

type Dependencies = {
  database: Pick<typeof prisma, "contact">;
  checkWhatsApp: (phone: string) => Promise<{ exists: boolean; phone: string }>;
};

export function createContactPhoneInspector({ database, checkWhatsApp }: Dependencies) {
  return async function inspectContactPhone(phone: string) {
    const findContact = (numbers: string[]) => database.contact.findFirst({
      where: { isGroup: false, phone: { in: [...new Set(numbers)] } },
      orderBy: [{ isSaved: "desc" }, { id: "asc" }],
      include: { assignments: { select: { userId: true } } },
    });
    let existing = await findContact([phone]);
    let whatsapp: boolean | null = null;
    let resolvedPhone = phone;
    // A saved duplicate can be shown even if the WhatsApp connection is offline.
    if (!existing?.isSaved) {
      const checked = await checkWhatsApp(phone);
      whatsapp = checked.exists;
      resolvedPhone = checked.phone;
      if (checked.exists && resolvedPhone !== phone) existing = await findContact([phone, resolvedPhone]);
    }
    const contact = existing ? {
      ...existing,
      name: contactDisplayName(existing),
      assignedUserIds: existing.assignments.map(item => item.userId),
      assignments: undefined,
      unreadCount: 0,
    } : null;
    return { phone: existing?.phone ?? resolvedPhone, whatsapp, contact };
  };
}

export type ContactPhoneInspection = Awaited<ReturnType<ReturnType<typeof createContactPhoneInspector>>>;
