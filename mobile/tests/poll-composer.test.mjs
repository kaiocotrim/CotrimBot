import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePoll } from '../src/lib/poll-composer.ts';

test('polls trim question and options and explicitly select one or multiple answers', () => {
  assert.deepEqual(preparePoll(' Quando? ', [' Hoje ', ' Amanhã '], false), { question: 'Quando?', options: ['Hoje', 'Amanhã'], selectableCount: 1 });
  assert.equal(preparePoll('Quando?', ['Hoje', 'Amanhã', 'Depois'], true).selectableCount, 3);
});

test('polls reject blank, duplicate, oversized or incomplete options before sending', () => {
  for (const [question, options] of [
    ['', ['A', 'B']], ['a'.repeat(256), ['A', 'B']], ['Q', ['A']],
    ['Q', ['A', '']], ['Q', ['Sim', ' sim ']], ['Q', ['a'.repeat(101), 'B']],
    ['Q', Array.from({ length: 13 }, (_, i) => String(i))],
  ]) assert.throws(() => preparePoll(question, options, false));
});
