import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { prisma } from '../src/lib/prisma.js';
import { setSocketServer } from '../src/lib/socket.js';
import webhookRoutes from '../src/routes/webhook.routes.js';
import { subscribeContactPresence } from '../src/controllers/contact.controller.js';
import { loadPatchedPresence, baileysFixture } from './evolution-presence-fixture.mjs';

// Offline protocol fixtures only: no test contacts WhatsApp or a configured remote Evolution.
test('Baileys parser → patched Evolution global webhook → existing backend → real Socket.IO → real frontend', async () => {
  const patched = await loadPatchedPresence();
  const originalMany = prisma.contact.findMany, originalUnique = prisma.contact.findUnique;
  const savedEnv = Object.fromEntries(['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE', 'PRESENCE_DEBUG'].map(key => [key, process.env[key]]));
  const originalInfo = console.info, logs: string[] = [];
  const contact = { id: 7, name: 'Ana', phone: '5511999999999', whatsappLid: '987654321@lid', isGroup: false, isSaved: true, archived: false, unreadCount: 0 };
  const app = express();app.use(express.json());
  const server = createServer(app), io = new Server(server);
  setSocketServer(io);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let requests = 0;
  try {
    process.env.PRESENCE_DEBUG = 'true';console.info = (...values) => { logs.push(values.join(' ')); };
    prisma.contact.findMany = (async query => {
      assert.ok(JSON.stringify(query).includes('whatsappLid'));
      assert.ok(!JSON.stringify((query as any).where.OR[0].phone.in).includes('987654321'));
      return [{ id: 7 }];
    }) as typeof prisma.contact.findMany;
    prisma.contact.findUnique = (async () => contact) as typeof prisma.contact.findUnique;
    app.use('/api', (req, _res, next) => { if (req.path === '/webhook/whatsapp') requests++;next(); }, webhookRoutes);
    app.get('/api/contacts', (_req, res) => res.json([contact]));
    app.get('/api/contacts/7/avatar', (_req, res) => res.json({ profilePictureUrl: null }));
    app.get('/api/contacts/7/messages', (_req, res) => res.json({ messages: [], hasMore: false }));
    app.post('/api/contacts/7/messages/read', (_req, res) => res.sendStatus(204));
    app.patch('/api/contacts/7/messages/read', (_req, res) => res.sendStatus(204));
    app.post('/api/contacts/:id/presence-subscription', subscribeContactPresence);
    app.use('/chat', new patched.ChatRouter((req, res, next) => req.headers.apikey === 'fixture-key' ? next() : res.sendStatus(401)).router);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    process.env.EVOLUTION_API_URL = origin;process.env.EVOLUTION_API_KEY = 'fixture-key';process.env.EVOLUTION_INSTANCE = 'cotrimbot';
    const webhook = new patched.WebhookController({}, {});
    patched.state.config.WEBHOOK.GLOBAL.URL = `${origin}/api/webhook/whatsapp`;
    const client = baileysFixture();
    patched.waMonitor.waInstances.cotrimbot = { client };
    const channel = new patched.ChannelFixture(client, (event, data) => webhook.emit({ event, data, instanceName: 'cotrimbot', origin: 'ChannelStartupService', serverUrl: origin, dateTime: new Date().toISOString(), sender: 'private-sender', apiKey: 'must-not-be-logged', local: true }));
    channel.start();

    const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
    const require = createRequire(path.join(frontend, 'package.json'));
    const bundle = await build({
      absWorkingDir: frontend, outfile: 'presence-flow.js', alias: { react: path.dirname(require.resolve('react/package.json')) },
      stdin: { resolveDir: frontend, loader: 'jsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import{useChat}from'@/hooks/use-chat';import{ChatHeader}from'@/components/chat/chat-header';import{socket}from'@/lib/socket';window.presenceEvents=0;socket.on('contact_presence',()=>window.presenceEvents++);function App(){const chat=useChat();window.chat=chat;const noop=()=>{};return chat.selectedContact?<ChatHeader contact={chat.selectedContact} currentUserId="me" isTyping={chat.isTyping} contactPresence={chat.contactPresence} searchOpen={false} searchQuery="" currentResult={0} resultCount={0} selectionMode={false} selectedCount={0} selectionBusy={false} onSetContactAssignment={async()=>{}} onOpenSearch={noop} onOpenFavorites={noop} onStartSelection={noop} onCloseSelection={noop} onFavoriteSelected={noop} onDeleteSelected={noop} onOpenForward={noop} onOpenContactInfo={noop} onSearchQueryChange={noop} onPreviousResult={noop} onNextResult={noop} onCloseSearch={noop} onOpenSidebar={noop} sidebarOpen={false}/>:null}createRoot(document.getElementById('root')).render(<App/>);` },
      bundle: true, write: false, jsx: 'automatic', define: { 'process.env': '{}', 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_API_URL': '"/api"' },
    });
    const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, 'app/globals.css') });
    app.get('/', (_req, res) => res.type('html').send('<div id="root" style="height:100dvh;background:#090909;color:white"></div>'));
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const errors: string[] = [];page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();await page.goto(origin);await page.addStyleTag({ content: css.css });
    for (const file of bundle.outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text });
    await expect.poll(() => io.engine.clientsCount).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).chat?.contacts.length)).toBe(1);
    await page.evaluate(() => (window as any).chat.selectContact((window as any).chat.contacts[0]));
    await expect.poll(() => client.nodes.length).toBe(2);
    assert.deepEqual(client.nodes.map(node => node.attrs.to), [contact.whatsappLid, `${contact.phone}@s.whatsapp.net`]);
    assert.ok(client.nodes.every(node => node.tag === 'presence' && node.attrs.type === 'subscribe'));
    const frame = (tag: string, audio = false) => client.ws.emit('CB:chatstate', { tag: 'chatstate', attrs: { from: contact.whatsappLid }, content: [{ tag, attrs: audio ? { media: 'audio' } : {} }] });
    frame('composing');
    const typing = page.getByRole('status', { name: 'Ana está digitando', exact: true });
    const recording = page.getByRole('status', { name: 'Ana está gravando áudio', exact: true });
    await expect(typing).toHaveText('digitando...');assert.equal(requests, 1);
    frame('composing', true);await expect(recording).toHaveText('gravando áudio...');await expect(typing).toHaveCount(0);
    frame('paused');await expect(recording).toHaveCount(0);
    // Both existing destinations may be enabled; the observer still forwards once, not twice.
    patched.state.local.enabled = true;patched.state.local.url = `${origin}/api/webhook/whatsapp`;
    const before = requests;frame('composing');await expect(typing).toBeVisible();await expect.poll(() => requests).toBe(before + 2);await expect.poll(() => page.evaluate(() => (window as any).presenceEvents)).toBe(requests);
    await page.clock.fastForward(6001);await expect(typing).toHaveCount(0);
    for (const stage of ['socket_node', 'baileys_event', 'evolution_forward', 'webhook_enter', 'webhook_config', 'webhook_http_attempt', 'webhook_http_response', 'emitted']) assert.ok(logs.some(line => line.includes(`"stage":"${stage}"`)), stage);
    assert.ok(logs.some(line => line.includes('"scope":"global"')));
    assert.ok(!logs.join('').includes(contact.phone) && !logs.join('').includes('987654321') && !logs.join('').includes('must-not-be-logged') && !logs.join('').includes('fixture-key'));
    assert.deepEqual(patched.state.logs, []);assert.deepEqual(errors, []);
    // Legacy LID digits in phone must not invent a PN alias or alter the stored contact.
    const originalPhone = contact.phone, beforeLegacy = client.nodes.length;
    contact.phone = '987654321';
    const legacyResponse = await fetch(`${origin}/api/contacts/7/presence-subscription`, { method: 'POST' });
    assert.equal(legacyResponse.status, 204);
    assert.deepEqual(client.nodes.slice(beforeLegacy).map(node => node.attrs.to), [contact.whatsappLid]);
    assert.equal(contact.phone, '987654321');contact.phone = originalPhone;
  } finally {
    if (browser) await browser.close();
    prisma.contact.findMany = originalMany;prisma.contact.findUnique = originalUnique;
    setSocketServer(null as unknown as Server);
    await new Promise<void>(resolve => io.close(() => resolve()));
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    console.info = originalInfo;
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key];else process.env[key] = value; }
    await patched.cleanup();
  }
});
