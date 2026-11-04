import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSource, messageImageSource, imageCaption } from '../src/lib/images.ts';

const api = { server: 'https://chat.example.com', token: 'session-test' };

test('message images use the backend media route with Bearer authentication', () => {
  assert.deepEqual(messageImageSource(api, 42), {
    uri: 'https://chat.example.com/api/messages/42/media',
    headers: { Authorization: 'Bearer session-test' },
  });
});

test('relative protected photos resolve against the server and external photos never receive the session', () => {
  assert.equal(imageSource(api, '/api/avatar/12').headers.Authorization, 'Bearer session-test');
  for (const uri of ['https://cdn.example.com/photo.jpg', '//cdn.example.com/photo.jpg', 'https://chat.example.com.evil.test/api/photo']) {
    assert.equal(imageSource(api, uri).headers, undefined);
  }
  assert.deepEqual(imageSource(api, '/uploads/avatar.png'), { uri: 'https://chat.example.com/uploads/avatar.png' });
  assert.equal(imageSource(api, 'file:///private/photo'), undefined);
  assert.equal(imageSource(api, 'https://user:pass@example.com/photo'), undefined);
  assert.equal(imageSource(api, ''), undefined);
});

test('image captions retain real text and suppress backend media placeholders', () => {
  for (const label of ['[Imagem]', '[Image]', '[Figurinha]', '[Sticker]', '', 'IMAGE']) {
    assert.equal(imageCaption(label, 'IMAGE'), '');
  }
  assert.equal(imageCaption('Foto do pedido', 'IMAGE'), 'Foto do pedido');
});
