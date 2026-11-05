import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDesktopRouter, desktopDownloadName } from '../src/routes/desktop.routes.js';

test('installer name preserves the normalized HTTPS origin, including ports', () => {
  for (const url of ['https://chat.cotrimdev.com.br/', 'https://cotrim.infordoc.net', 'https://chat.example.com:444/']) {
    const filename = desktopDownloadName(url);
    assert.equal(Buffer.from(filename.slice(11, -4), 'hex').toString(), new URL(url).origin);
    assert.ok(filename.length < 255);
  }
  for (const url of [undefined, ['https://example.com'], 'http://example.com', 'file:///C:/Windows', 'https://user:pass@example.com', 'https://example.com/login', 'https://example.com/?token=x', 'https://example.com/#x', `https://${'a'.repeat(120)}.com`]) {
    assert.throws(() => desktopDownloadName(url));
  }
});

test('public download streams a fixed artifact with the chosen name; HEAD and missing artifact are handled', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cotrimbot-download-'));
  const artifact = path.join(directory, 'setup.exe');
  await writeFile(artifact, 'installer fixture');
  const app = express(); app.use('/api', createDesktopRouter(artifact));
  app.use('/missing', createDesktopRouter(path.join(directory, 'missing.exe')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const query = '?server=' + encodeURIComponent('https://chat.cotrimdev.com.br');
  try {
    const response = await fetch(base + '/api/desktop/download' + query);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-disposition')?.includes(desktopDownloadName('https://chat.cotrimdev.com.br')));
    assert.equal(await response.text(), 'installer fixture');
    const head = await fetch(base + '/api/desktop/download' + query, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal((await fetch(base + '/api/desktop/download?server=http://example.com')).status, 400);
    assert.equal((await fetch(base + '/missing/desktop/download' + query)).status, 503);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
