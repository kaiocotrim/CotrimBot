import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadPatchedPresence, baileysFixture } from './evolution-presence-fixture.mjs';
import { patchEvolutionPresence } from '../../evolution-polls/presence-patch.mjs';
import { subscribeNativePresence, observeNativePresence } from '../../evolution-polls/native-presence.js';

const pn = '5511999999999@s.whatsapp.net', lid = '987654321@lid';

test('native subscription keeps supplied PN/LID, writes only subscribe nodes and never sends chatstate or updates session keys', async () => {
  const client = baileysFixture();
  let reads = 0;
  client.authState.keys.get = async () => { reads++; return {}; };
  assert.deepEqual(await subscribeNativePresence({ client }, { number: '987654321:2@lid', aliases: [pn] }), { subscribed: true, targets: 2 });
  assert.deepEqual(client.nodes.map(node => node.attrs.to), [lid, pn]);
  assert.ok(client.nodes.every(node => node.tag === 'presence' && node.attrs.type === 'subscribe'));
  assert.equal(reads, 0);
  await assert.rejects(subscribeNativePresence({ client }, { number: 'group@g.us' }));
  await assert.rejects(subscribeNativePresence({ client }, { number: pn, aliases: [lid, '123@lid'] }));
});

test('subscription reads existing bidirectional mappings without USync, onWhatsApp or session writes', async () => {
  for (const [number, key, stored, alternate] of [[pn, '5511999999999', '987654321', lid], [lid, '987654321_reverse', '5511999999999', pn]]) {
    const client = baileysFixture();
    client.authState.keys.get = async (type, keys) => { assert.equal(type, 'lid-mapping'); assert.deepEqual(keys, [key]); return { [key]: stored }; };
    await subscribeNativePresence({ client }, { number });
    assert.deepEqual(client.nodes.map(node => node.attrs.to), [number, alternate]);
  }
});

test('real Baileys parser forwards once while the original message queue is blocked; observers detach on socket close', async () => {
  const patched = await loadPatchedPresence();
  try {
    const client = baileysFixture(), forwarded: unknown[] = [];
    let unblock!: () => void;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    const channel = new patched.ChannelFixture(client, async (event, data) => { forwarded.push([event, data]); });
    channel.messageHandle['messages.upsert'] = async () => gate;
    channel.start();channel.start();
    assert.equal(client.ev.listenerCount('presence.update'), 1);
    client.ev.emit('messages.upsert', { messages: [] });
    client.ws.emit('CB:chatstate', { tag: 'chatstate', attrs: { from: lid }, content: [{ tag: 'composing', attrs: { media: 'audio' } }] });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(forwarded, [['presence.update', { id: lid, presences: { [lid]: { lastKnownPresence: 'recording' } } }]]);
    unblock();await channel.eventProcessingQueue;
    await new Promise(resolve => setTimeout(resolve, 10));assert.equal(forwarded.length, 1);
    client.ws.emit('close');assert.equal(client.ev.listenerCount('presence.update'), 0);
  } finally { await patched.cleanup(); }
});

test('authenticated subscription route uses :instanceName and preserves the old sendPresence route', async () => {
  const patched = await loadPatchedPresence();
  try {
    const client = baileysFixture();patched.waMonitor.waInstances.cotrimbot = { client };
    let guarded = 0;
    const router = new patched.ChatRouter((_req, _res, next) => { guarded++;next(); }).router;
    const invoke = (route, instance, body) => new Promise<any>((resolve, reject) => router.handle({ method: 'POST', url: `/${route}/${instance}`, body, headers: {} }, { code: 200, status(code) { this.code = code;return this; }, json(body) { resolve({ code: this.code, body }); } }, error => reject(error ?? new Error('Missing route'))));
    assert.equal((await invoke('subscribePresence', 'cotrimbot', { number: lid, aliases: [pn] })).code, 200);
    assert.equal(guarded, 1);assert.equal(client.nodes.length, 2);
    assert.equal((await invoke('subscribePresence', 'missing', { number: pn })).code, 400);
    assert.equal((await invoke('sendPresence', 'cotrimbot', {})).code, 201);
  } finally { await patched.cleanup(); }
});

test('upstream sendPresence can rewrite an explicit LID to cached PN; the new subscription preserves both', async () => {
  const patched = await loadPatchedPresence();
  try {
    const client = baileysFixture();
    client.sendPresenceUpdate = async () => {};
    const channel = new patched.ChannelFixture(client, async () => {});
    channel.whatsappNumber = async () => [{ exists: true, jid: pn }];
    await channel.sendPresence({ number: lid, presence: 'paused', delay: 1 });
    assert.deepEqual(client.nodes.map(node => node.attrs.to), [pn]);
    client.nodes.length = 0;
    await patched.subscribeNativePresence(channel, { number: lid, aliases: [pn] });
    assert.deepEqual(client.nodes.map(node => node.attrs.to), [lid, pn]);
  } finally { await patched.cleanup(); }
});

test('upstream global webhook flags control actual HTTP delivery and failures produce safe diagnostic stages', async () => {
  const patched = await loadPatchedPresence();
  const oldInfo = console.info, previous = process.env.PRESENCE_DEBUG, lines: string[] = [];
  try {
    console.info = (...values) => { lines.push(values.join(' ')); };process.env.PRESENCE_DEBUG = 'true';
    // A forbidden loopback port reaches the HTTP failure path without contacting WhatsApp.
    patched.state.config.WEBHOOK.GLOBAL.URL = 'http://127.0.0.1:1/unreachable';
    const webhook = new patched.WebhookController({}, {});
    const event = { instanceName: 'cotrimbot', origin: 'ChannelStartupService', event: 'presence.update', data: { id: lid, presences: { [lid]: { lastKnownPresence: 'composing' } } }, local: false, apiKey: 'secret-key' };
    patched.state.config.WEBHOOK.EVENTS.PRESENCE_UPDATE = false;
    await webhook.emit(event);assert.ok(!lines.some(line => line.includes('webhook_http_attempt')));
    patched.state.config.WEBHOOK.EVENTS.PRESENCE_UPDATE = true;
    await webhook.emit(event);
    assert.ok(lines.some(line => line.includes('webhook_http_attempt')));
    assert.ok(lines.some(line => line.includes('webhook_http_failed')));
    assert.ok(!lines.join('').includes('secret-key') && !lines.join('').includes('987654321'));
  } finally {
    console.info = oldInfo;if (previous === undefined) delete process.env.PRESENCE_DEBUG;else process.env.PRESENCE_DEBUG = previous;
    await patched.cleanup();
  }
});

test('patch refuses unsupported upstream before modifying any file, and presence logs never print payloads or credentials', async () => {
  const patched = await loadPatchedPresence();
  const previous = process.env.PRESENCE_DEBUG, original = console.info, lines: string[] = [];
  try {
    const before = await readFile(path.join(patched.root, patched.sourcePaths.router), 'utf8');
    await assert.rejects(patchEvolutionPresence(patched.root), /requires the pinned/);
    assert.equal(await readFile(path.join(patched.root, patched.sourcePaths.router), 'utf8'), before);
    console.info = (...values) => { lines.push(values.join(' ')); };
    process.env.PRESENCE_DEBUG = 'true';
    const client = baileysFixture();
    observeNativePresence(client, { active: () => true, ignoreGroups: () => false, forward: async () => {} });
    client.ws.emit('CB:chatstate', { tag: 'chatstate', attrs: { from: lid, token: 'secret-token' }, content: [{ tag: 'composing', attrs: {} }], apikey: 'secret-key' });
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(lines.some(line => line.includes('socket_node')) && lines.some(line => line.includes('baileys_event')));
    assert.ok(!lines.join('').includes('987654321') && !lines.join('').includes('secret-'));
  } finally {
    console.info = original;if (previous === undefined) delete process.env.PRESENCE_DEBUG;else process.env.PRESENCE_DEBUG = previous;
    await patched.cleanup();
  }
});
