import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBotRouter } from '../src/routes/bot.routes.js';
import type { prisma } from '../src/lib/prisma.js';
import { fixture } from './bot-fixture.js';

test('simulador executa chamado sem gravar; listagem exige administrador e isola empresa', async () => {
  let reads = 0;
  const db: any = {
    member: { findUnique: async ({ where }: any) => ({ role: where.organizationId_userId.userId === 'admin' ? 'admin' : 'member' }) },
    sacTestTicket: { findMany: async ({ where }: any) => { reads++; return [{ id: 'test-ticket', organizationId: where.organizationId }]; } },
  };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: req.get('x-user') ?? 'admin' } as any; req.activeOrganizationId = req.get('x-org') ?? 'company-a'; next(); });
  app.use(createBotRouter(db as typeof prisma));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/bots`;
  try {
    const flow = fixture(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
    const inputs = ['1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com', '1', 'Descrição longa '.repeat(20), '1'];
    const response = await fetch(base + '/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flow, inputs }) });
    assert.equal(response.status, 200);
    const simulation = await response.json() as any;
    assert.equal(simulation.state.sacTest, undefined);
    assert.match(simulation.messages.at(-1).text, /Nenhum registro foi salvo/);
    assert.equal(reads, 0);
    assert.equal((await fetch(base + '/sac-test/tickets', { headers: { 'x-user': 'member' } })).status, 403);
    const listed = await fetch(base + '/sac-test/tickets', { headers: { 'x-org': 'company-b' } });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json() as any).tickets[0].organizationId, 'company-b');
    assert.equal(reads, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
