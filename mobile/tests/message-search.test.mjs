import test from 'node:test';
import assert from 'node:assert/strict';
import { findMessages } from '../src/lib/message-search.ts';
import { systemMessageLabel } from '../src/lib/system-message.ts';

test('conversation search matches accents, case and multiple terms without including deleted or system payloads', () => {
  const messages = [
    { id: 4, content: 'AÇÃO para o CLIENTE', type: 'TEXT' },
    { id: 3, content: 'Ação cliente apagada', type: 'TEXT', deletedAt: '2026-11-04' },
    { id: 2, content: '{"actor":"ação cliente"}', type: 'SYSTEM' },
    { id: 1, content: 'Ação para outra pessoa', type: 'TEXT' },
  ];
  assert.deepEqual(findMessages(messages, 'cliente acao').map(message => message.id), [4]);
  assert.equal(findMessages(messages, 'inexistente').length, 0);
  assert.equal(findMessages(messages, '  '), messages);
});

test('assignment and closing events display readable activity messages', () => {
  assert.equal(systemMessageLabel(JSON.stringify({ kind: 'closed', actor: { id: 'me', name: 'Ana' } }), 'me'), 'Você finalizou');
  assert.equal(systemMessageLabel(JSON.stringify({ kind: 'assignment', actor: { id: 'other', name: 'Ana' }, targets: [{ id: 'me', name: 'Pedro' }] }), 'me'), 'Ana atribuiu para você');
  assert.equal(systemMessageLabel('Evento antigo', 'me'), 'Evento antigo');
});
