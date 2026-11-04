import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentForm, canReply, messagePreview } from '../src/lib/message-composer.ts';

test('native uploads contain the file descriptor, optional caption and quoted message id', () => {
  class RecordingForm extends FormData {
    fields = new Map();
    append(name, value) { this.fields.set(name, value); }
  }
  const form = attachmentForm({ uri: 'file:///cache/foto.jpg', name: 'foto.jpg', mimeType: 'image/jpeg' }, '  Veja a foto  ', 31, new RecordingForm());
  assert.deepEqual(form.fields.get('file'), { uri: 'file:///cache/foto.jpg', name: 'foto.jpg', type: 'image/jpeg' });
  assert.equal(form.fields.get('caption'), 'Veja a foto');
  assert.equal(form.fields.get('replyToMessageId'), '31');
  assert.equal(form.fields.get('includeSignature'), 'true');
  const noCaption = attachmentForm({ uri: 'file:///cache/a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }, ' ', undefined, new RecordingForm());
  assert.equal(noCaption.fields.has('caption'), false);
  assert.equal(noCaption.fields.has('replyToMessageId'), false);
});

test('reply targets exclude deleted, private and system messages', () => {
  assert.equal(canReply({ type: 'TEXT' }), true);
  assert.equal(canReply({ type: 'IMAGE' }), true);
  assert.equal(canReply({ type: 'TEXT', private: true }), false);
  assert.equal(canReply({ type: 'TEXT', deletedAt: '2026-11-04' }), false);
  assert.equal(canReply({ type: 'SYSTEM' }), false);
  assert.equal(messagePreview({ type: 'IMAGE', content: '[Imagem]' }), 'Imagem');
  assert.equal(messagePreview({ type: 'TEXT', content: 'Olá' }), 'Olá');
  assert.equal(messagePreview({ type: 'TEXT', content: 'Conteúdo removido', deletedAt: '2026-11-04' }), 'Mensagem apagada');
});
