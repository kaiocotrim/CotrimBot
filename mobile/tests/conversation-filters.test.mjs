import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyConversationFilters, matchesConversationFilters } from '../src/lib/conversation-filters.ts';

const contact = {
  id: 1, name: 'Cliente', phone: '5511999999999', isGroup: false, archived: false,
  unreadCount: 2, favoriteMessageCount: 1, priority: 'HIGH', assignedUserIds: ['bot', 'bruno'],
};

test('combines message flags, service priority and the actual assigned member', () => {
  const filters = { unread: true, favorites: true, priority: true, assigneeId: 'bot' };
  assert.equal(matchesConversationFilters(contact, filters), true);
  for (const change of [
    { unreadCount: 0 }, { favoriteMessageCount: 0 }, { priority: 'NONE' },
    { assignedUserIds: ['bruno'] },
  ]) assert.equal(matchesConversationFilters({ ...contact, ...change }, filters), false);
  assert.equal(matchesConversationFilters(contact, { ...filters, assigneeId: 'bruno' }), true);
});

test('favorites use favorited messages, not pins or the contact favorite flag', () => {
  const filters = { ...emptyConversationFilters, favorites: true };
  assert.equal(matchesConversationFilters({ ...contact, favoriteMessageCount: 0, pinned: true, favorited: true }, filters), false);
  assert.equal(matchesConversationFilters({ ...contact, favoriteMessageCount: undefined }, filters), false);
  assert.equal(matchesConversationFilters({ ...contact, pinned: false }, filters), true);
});

test('priority accepts all explicit service priorities and excludes an unset priority', () => {
  const filters = { ...emptyConversationFilters, priority: true };
  for (const priority of ['LOW', 'MEDIUM', 'HIGH']) assert.equal(matchesConversationFilters({ ...contact, priority }, filters), true);
  for (const priority of ['NONE', undefined, null]) assert.equal(matchesConversationFilters({ ...contact, priority }, filters), false);
});

test('no extra filters includes read, unassigned conversations without favorites', () => {
  assert.equal(matchesConversationFilters({ ...contact, unreadCount: 0, favoriteMessageCount: 0, priority: 'NONE', assignedUserIds: [] }, emptyConversationFilters), true);
  assert.equal(matchesConversationFilters({ ...contact, assignedUserIds: undefined }, { ...emptyConversationFilters, assigneeId: 'bot' }), false);
});
