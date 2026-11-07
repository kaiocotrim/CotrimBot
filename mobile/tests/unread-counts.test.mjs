import test from 'node:test';
import assert from 'node:assert/strict';
import { unreadCounts } from '../src/lib/unread-counts.ts';
import { coalescedRefresh } from '../src/lib/coalesced-refresh.ts';

const base = { id: 1, name: 'Cliente', phone: '5511999999999', isGroup: false, archived: false, unreadCount: 0 };

test('dock counts unread messages in the same scopes as Conversas, Minhas and Grupos', () => {
  const contacts = [
    { ...base, unreadCount: 3, assignedUserIds: ['me', 'other'] },
    { ...base, id: 2, unreadCount: 5, assignedUserIds: ['other'] },
    { ...base, id: 3, unreadCount: 7, isGroup: true, assignedUserIds: ['me'] },
    { ...base, id: 4, unreadCount: 20, archived: true, assignedUserIds: ['me'] },
  ];
  assert.deepEqual(unreadCounts(contacts, 'me'), { conversations: 8, mine: 3, groups: 7, contacts: 0, profile: 0 });
  assert.equal(unreadCounts(contacts, '').mine, 0);
  assert.equal(unreadCounts(contacts.map(contact => ({ ...contact, unreadCount: 0 })), 'me').conversations, 0);
});

test('counters ignore negative or invalid unread counts', () => {
  assert.equal(unreadCounts([-1, NaN, Infinity, undefined].map(unreadCount => ({ ...base, unreadCount })), 'me').conversations, 0);
});

test('bursts during a slow refresh trigger a follow-up without concurrent requests', async () => {
  const releases = [];
  let calls = 0;
  const refresh = coalescedRefresh(() => {
    calls++;
    return new Promise(resolve => releases.push(resolve));
  });
  const first = refresh();
  await Promise.resolve();
  assert.equal(calls, 1);
  const burst = Array.from({ length: 20 }, () => refresh());
  assert.equal(calls, 1);
  releases.shift()();
  await Promise.resolve();
  assert.equal(calls, 2);
  releases.shift()();
  await Promise.all([first, ...burst]);
  assert.equal(calls, 2);
});

test('a failed refresh does not block later updates', async () => {
  let calls = 0;
  const refresh = coalescedRefresh(async () => {
    if (++calls === 1) throw new Error('offline');
  });
  await assert.rejects(refresh(), /offline/);
  await refresh();
  assert.equal(calls, 2);
});
