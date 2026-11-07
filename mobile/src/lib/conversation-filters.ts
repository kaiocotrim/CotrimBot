import type { Contact } from './types';

export type ConversationFilters = {
  unread: boolean;
  favorites: boolean;
  priority: boolean;
  assigneeId: string | null;
};

export const emptyConversationFilters: ConversationFilters = {
  unread: false, favorites: false, priority: false, assigneeId: null,
};

export function matchesConversationFilters(contact: Contact, filters: ConversationFilters): boolean {
  return (!filters.unread || contact.unreadCount > 0)
    && (!filters.favorites || (contact.favoriteMessageCount ?? 0) > 0)
    && (!filters.priority || ['LOW', 'MEDIUM', 'HIGH'].includes(contact.priority ?? 'NONE'))
    && (!filters.assigneeId || !!contact.assignedUserIds?.includes(filters.assigneeId));
}
