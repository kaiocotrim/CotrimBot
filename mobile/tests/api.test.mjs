import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, ApiError, normalizeServer } from '../src/lib/api.ts';

test('message context actions use authenticated routes and explicit deletion scopes', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'token', async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer token');
    calls.push({ path: url.replace('https://example.com/api', ''), method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    return Response.json(url.endsWith('/ai/translate') ? { text: 'Olá' } : { id: 3 });
  });
  assert.equal(await api.translateMessage('Hello'), 'Olá');
  await api.reactToMessage(3, '👍');
  await api.messageFlags(3, { pinned: true, pinDurationHours: 168 });
  await api.messageFlags(3, { favorited: true });
  await api.deleteMessage(3, 'me');
  assert.deepEqual(calls, [
    { path: '/ai/translate', method: 'POST', body: { text: 'Hello' } },
    { path: '/messages/3/reaction', method: 'PUT', body: { reaction: '👍' } },
    { path: '/messages/3/flags', method: 'PATCH', body: { pinned: true, pinDurationHours: 168 } },
    { path: '/messages/3/flags', method: 'PATCH', body: { favorited: true } },
    { path: '/messages/3?scope=me', method: 'DELETE', body: undefined },
  ]);
});

test('private notes and disabled signatures are explicit on text and media requests', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'token', async (url, init) => {
    calls.push({ url, body: init.body });
    return Response.json({ message: { id: 1 } });
  });
  await api.send(7, 'Somente equipe', undefined, { private: true, includeSignature: false });
  assert.deepEqual(JSON.parse(calls[0].body), { text: 'Somente equipe', private: true, includeSignature: false });
  await api.sendMedia(7, { uri: 'file:///foto.jpg', name: 'foto.jpg', mimeType: 'image/jpeg' }, 'Legenda', undefined, false);
  assert.equal(calls[1].body.get('includeSignature'), 'false');
  const poll = { question: 'Quando?', options: ['Hoje', 'Amanhã'], selectableCount: 1 };
  await api.sendPoll(7, poll);
  assert.equal(calls[2].url, 'https://example.com/api/contacts/7/send-poll');
  assert.deepEqual(JSON.parse(calls[2].body), poll);
});

test('AI rewrite uses the same authenticated endpoint as web and does not send the draft', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'token', async (url, init) => {
    calls.push(url);
    assert.equal(url, 'https://example.com/api/ai/rewrite');
    assert.equal(init.headers.Authorization, 'Bearer token');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { text: 'me manda o boleto' });
    return Response.json({ text: 'Por favor, envie o boleto.' });
  });
  assert.equal(await api.rewriteMessage('  me manda o boleto  '), 'Por favor, envie o boleto.');
  assert.equal(calls.length, 1);
});

test('AI rewrite rejects invalid responses and preserves server errors', async () => {
  for (const text of ['', null, '   ', 'a'.repeat(10001)]) {
    const api = new Api('https://example.com', 'token', async () => Response.json({ text }));
    await assert.rejects(api.rewriteMessage('Original'), /rascunho foi mantido/);
  }
  const api = new Api('https://example.com', 'token', async () => Response.json({ error: 'IA não configurada' }, { status: 503 }));
  await assert.rejects(api.rewriteMessage('Original'), /IA não configurada/);
});

test('history lookup used by previews only reads messages and sends no read receipt', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'token', async (url, init) => {
    calls.push({ url, method: init.method ?? 'GET' });
    assert.equal(init.headers.Authorization, 'Bearer token');
    return Response.json({ messages: [{ id: 10, content: 'Não lida', readAt: null }], hasMore: false, nextCursor: null });
  });
  const page = await api.messages(7);
  assert.equal(page.messages[0].readAt, null);
  assert.deepEqual(calls, [{ url: 'https://example.com/api/contacts/7/messages?limit=40', method: 'GET' }]);
});

test('conversation list requests favorite message counts for the filter', async () => {
  const api = new Api('https://example.com', 'token', async (url, init) => {
    assert.equal(url, 'https://example.com/api/contacts?includeFavoriteCounts=1');
    assert.equal(init.headers.Authorization, 'Bearer token');
    return Response.json([{ id: 1, favoriteMessageCount: 2 }]);
  });
  assert.equal((await api.contacts())[0].favoriteMessageCount, 2);
});

test('server normalization accepts an API suffix and rejects credentials and insecure production URLs', () => {
  assert.equal(normalizeServer(' https://chat.example.com/api/ '), 'https://chat.example.com');
  assert.equal(normalizeServer('http://192.168.1.20:3001', true), 'http://192.168.1.20:3001');
  for (const value of ['http://example.com', 'https://u:p@example.com', 'https://example.com/path', 'https://example.com/?token=x', 'file:///etc', 'not a url']) {
    assert.throws(() => normalizeServer(value));
  }
});

test('email sign-in obtains the Bearer header and validates the session without cookies', async () => {
  const calls = [];
  const api = new Api('https://example.com', null, async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/sign-in/email')) return Response.json({ token: 'not-the-header-token' }, { headers: { 'set-auth-token': 'signed-session' } });
    return Response.json({ user: { id: '1', name: 'Ana', email: 'ana@example.com' }, session: { id: 's1' } });
  });
  const result = await api.signIn(' ana@example.com ', 'password');
  assert.equal(result.token, 'signed-session');
  assert.equal(result.session.user.name, 'Ana');
  assert.equal(calls[0].url, 'https://example.com/api/auth/sign-in/email');
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: 'ana@example.com', password: 'password' });
  assert.equal(calls[1].init.headers.Authorization, 'Bearer signed-session');
  assert.equal(calls[1].init.credentials, 'omit');
});

test('login fails clearly if the backend does not support the Bearer response header', async () => {
  const api = new Api('https://example.com', null, async () => Response.json({ token: 'raw-token' }));
  await assert.rejects(() => api.signIn('ana@example.com', 'password'), /plugin bearer/);
});

test('expired sessions invalidate local authentication while network failures do not', async () => {
  let invalidated = 0;
  const api = new Api('https://example.com', 'token', async () => Response.json({ message: 'Sessão expirada' }, { status: 401 }));
  api.onUnauthorized = () => invalidated++;
  await assert.rejects(() => api.contacts(), error => error instanceof ApiError && error.status === 401);
  assert.equal(invalidated, 1);
  api.transport = async () => { throw new Error('Network request failed'); };
  await assert.rejects(() => api.contacts(), /conectar/);
  assert.equal(invalidated, 1);
});

test('chat requests preserve backend pagination and send signature-enabled text', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'token', async (url, init) => {
    calls.push({ url, init });
    return Response.json({ messages: [], nextCursor: null, hasMore: false });
  });
  await api.messages(12, 55);
  await api.send(12, 'Olá!');
  await api.markRead(12);
  assert.equal(calls[0].url, 'https://example.com/api/contacts/12/messages?limit=40&before=55');
  assert.equal(calls[1].url, 'https://example.com/api/contacts/12/send');
  assert.deepEqual(JSON.parse(calls[1].init.body), { text: 'Olá!', includeSignature: true, private: false });
  assert.equal(calls[2].init.method, 'PATCH');
});

test('server errors are shown and 204 responses need no JSON body', async () => {
  const api = new Api('https://example.com', 'token', async () => Response.json({ message: 'Contato não encontrado' }, { status: 404 }));
  await assert.rejects(() => api.messages(999), /Contato não encontrado/);
  api.transport = async () => new Response(null, { status: 204 });
  assert.equal(await api.request('/empty'), undefined);
});

test('contact details and edits use the authenticated contact endpoint', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'session', async (url, init) => {
    calls.push({ url, init });
    return Response.json({ id: 12, name: 'Ana', phone: '5511999999999' });
  });
  await api.contact(12);
  await api.updateContact(12, { name: 'Ana Silva', phone: '5511999999999', companyName: 'Empresa', jobTitle: 'T.I' });
  assert.equal(calls[0].url, 'https://example.com/api/contacts/12');
  assert.equal(calls[1].init.method, 'PATCH');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer session');
  assert.deepEqual(JSON.parse(calls[1].init.body), { name: 'Ana Silva', phone: '5511999999999', companyName: 'Empresa', jobTitle: 'T.I' });
});

test('contact library queries stay scoped to the contact across tabs and pagination', async () => {
  const urls = [];
  const api = new Api('https://example.com', 'session', async url => {
    urls.push(url); return Response.json({ items: [], hasMore: false });
  });
  await api.mediaSummary(12);
  await api.media(12, 'documents', 45);
  await api.media(12, 'links');
  assert.equal(urls[0], 'https://example.com/api/media-library?contactId=12&summary=1');
  assert.equal(urls[1], 'https://example.com/api/media-library?contactId=12&tab=documents&sort=newest&cursor=45');
  assert.equal(urls[2], 'https://example.com/api/media-library?contactId=12&tab=links&sort=newest');
});

test('contact actions use authenticated endpoints and preserve assignment removal and priority clearing', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'session', async (url, init) => {
    calls.push({ url, init }); return Response.json({ id: 12, assignedUserIds: [] });
  });
  await api.assignees();
  await api.setAssignment(12, ['a', 'b']);
  await api.setAssignment(12, []);
  await api.setPriority(12, 'MEDIUM');
  await api.setPriority(12, 'NONE');
  await api.closeConversation(12);
  assert.equal(calls[0].url, 'https://example.com/api/contacts/assignees');
  assert.deepEqual(JSON.parse(calls[1].init.body), { assignedUserIds: ['a', 'b'] });
  assert.deepEqual(JSON.parse(calls[2].init.body), { assignedUserIds: [] });
  assert.equal(calls[1].init.method, 'PATCH');
  assert.equal(calls[3].url, 'https://example.com/api/contacts/12/priority');
  assert.deepEqual(JSON.parse(calls[3].init.body), { priority: 'MEDIUM' });
  assert.deepEqual(JSON.parse(calls[4].init.body), { priority: 'NONE' });
  assert.equal(calls[5].url, 'https://example.com/api/contacts/12/close-with-bot');
  assert.equal(calls[5].init.method, 'POST');
  for (const call of calls) assert.equal(call.init.headers.Authorization, 'Bearer session');
});

test('text replies retain the selected message and uploads let native FormData set its multipart boundary', async () => {
  const calls = [];
  const api = new Api('https://example.com', 'session', async (url, init) => {
    calls.push({ url, init }); return Response.json({ message: { id: 99 } });
  });
  await api.send(12, 'Resposta', 31);
  await api.sendMedia(12, { uri: 'file:///cache/a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }, 'Legenda', 31);
  assert.equal(JSON.parse(calls[0].init.body).replyToMessageId, 31);
  assert.equal(new Headers(calls[0].init.headers).get('content-type'), 'application/json');
  assert.equal(calls[1].url, 'https://example.com/api/contacts/12/send-media');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(new Headers(calls[1].init.headers).get('authorization'), 'Bearer session');
  assert.equal(new Headers(calls[1].init.headers).has('content-type'), false);
  assert.ok(calls[1].init.body instanceof FormData);
  assert.equal(calls[1].init.body.get('replyToMessageId'), '31');
  assert.equal(calls[1].init.body.get('caption'), 'Legenda');
});

test('failed uploads report errors without retrying or dropping authentication', async () => {
  let calls = 0;
  const api = new Api('https://example.com', 'session', async () => {
    calls++; return Response.json({ message: 'Arquivo não aceito' }, { status: 413 });
  });
  await assert.rejects(() => api.sendMedia(12, { uri: 'file:///cache/a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }, ''), /Arquivo não aceito/);
  assert.equal(calls, 1);
});
