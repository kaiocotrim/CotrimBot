import type { Contact } from './types';

export function unreadCounts(contacts: Contact[], userId: string) {
  const counts = { conversations: 0, mine: 0, groups: 0, contacts: 0, profile: 0 };
  for (const contact of contacts) {
    if (contact.archived) continue;
    const count = Number.isFinite(contact.unreadCount) ? Math.max(0, Math.floor(contact.unreadCount)) : 0;
    if (contact.isGroup) counts.groups += count;
    else {
      counts.conversations += count;
      if (userId && contact.assignedUserIds?.includes(userId)) counts.mine += count;
    }
  }
  return counts;
}
