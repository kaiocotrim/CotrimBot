import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore, draftKey } from '../src/lib/drafts.ts';

test('drafts stay isolated by server, user, organization and conversation', () => {
  const keys = [
    draftKey('https://a.example', 'ana', 'empresa', 1),
    draftKey('https://b.example', 'ana', 'empresa', 1),
    draftKey('https://a.example', 'bia', 'empresa', 1),
    draftKey('https://a.example', 'ana', 'outra', 1),
    draftKey('https://a.example', 'ana', 'empresa', 2),
  ];
  assert.equal(new Set(keys).size, 5);
});

test('queued draft writes cannot restore old text after a successful send clears it', async () => {
  const data = new Map();
  let release;
  const first = new Promise(resolve => { release = resolve; });
  let count = 0;
  const drafts = createDraftStore({
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { if (count++ === 0) await first; data.set(key, value); },
    removeItem: async key => data.delete(key),
  });
  const old = drafts.write('one', 'Texto antigo');
  const latest = drafts.write('one', 'Texto final');
  const cleared = drafts.write('one', '');
  const read = drafts.read('one');
  release(); await Promise.all([old, latest, cleared]);
  assert.equal(await read, '');
  assert.equal(data.has('one'), false);
});

test('a failed disk write does not block subsequent saves or discard whitespace', async () => {
  const data = new Map(); let fail = true;
  const drafts = createDraftStore({
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { if (fail) { fail = false; throw new Error('Disk unavailable'); } data.set(key, value); },
    removeItem: async key => data.delete(key),
  });
  await assert.rejects(() => drafts.write('one', 'Antigo'));
  await drafts.write('one', '  Novo\ntexto  ');
  assert.equal(await drafts.read('one'), '  Novo\ntexto  ');
  assert.equal(await drafts.read('other'), '');
});
