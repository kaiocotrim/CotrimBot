import test from 'node:test';
import assert from 'node:assert/strict';
import { messageActions, messageActionText } from '../src/lib/message-actions.ts';

const text = { type: 'TEXT', content: 'Hello', direction: 'INCOMING' };

test('public text supports the context menu actions', () => {
  assert.deepEqual(messageActions(text), { reply: true, copy: true, translate: true, react: true, forward: true, flags: true, delete: true });
});

test('private notes cannot be replied to publicly, reacted to or forwarded', () => {
  const actions = messageActions({ ...text, private: true });
  assert.equal(actions.reply, false);
  assert.equal(actions.react, false);
  assert.equal(actions.forward, false);
  assert.equal(actions.copy, true);
  assert.equal(actions.flags, true);
});

test('media placeholders do not become copyable or translatable text', () => {
  for (const content of ['[Áudio]', '[Imagem]', '[Figurinha]', '[Documento]', '[Vídeo]']) {
    const message = { ...text, type: 'IMAGE', content };
    assert.equal(messageActionText(message), '');
    assert.equal(messageActions(message).translate, false);
    assert.equal(messageActions(message).forward, true);
  }
  assert.equal(messageActions({ ...text, type: 'IMAGE', content: 'Real caption' }).translate, true);
});

test('deleted messages only offer local removal and system events offer no actions', () => {
  const deleted = messageActions({ ...text, deletedAt: '2026-11-07' });
  assert.equal(deleted.delete, true);
  assert.equal(Object.values(deleted).filter(Boolean).length, 1);
  assert.equal(Object.values(messageActions({ ...text, type: 'SYSTEM' })).some(Boolean), false);
  assert.equal(messageActions({ ...text, content: 'x'.repeat(10001) }).translate, false);
});
