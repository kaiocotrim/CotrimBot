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
  app.use(createBotRouter(db as typeof prisma, { enabled: () => false, findCompany: async () => [], loadAddresses: async () => [] }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/bots`;
  try {
    const flow = fixture(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
    const inputs = ['1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com'];
    const response = await fetch(base + '/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flow, inputs }) });
    assert.equal(response.status, 200);
    const simulation = await response.json() as any;
    assert.equal(simulation.state.sacTest.step, 'nextStep');
    assert.match(simulation.messages.at(-1).text, /Nenhum chamado foi aberto no SAC/);
    assert.equal(reads, 0);
    assert.equal((await fetch(base + '/sac-test/tickets', { headers: { 'x-user': 'member' } })).status, 403);
    const listed = await fetch(base + '/sac-test/tickets', { headers: { 'x-org': 'company-b' } });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json() as any).tickets[0].organizationId, 'company-b');
    assert.equal(reads, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('simulator resolves real SAC companies, keeps dynamic addresses and handles lookup failures without writes', async () => {
  const requests: string[] = [];
  let failing = false;
  const company = { id: 'real-tenant', cnpj: '60934551000405', name: 'ab brasil', equipment: [], addresses: [] };
  const app = express(); app.use(express.json());
  // Any unexpected database access fails: simulation must remain read-only.
  app.use(createBotRouter({} as typeof prisma, {
    enabled: () => true,
    findCompany: async cnpj => {
      requests.push(cnpj);
      if (failing) throw new Error('Do not expose upstream secrets');
      return cnpj === company.cnpj ? [structuredClone(company)] : [];
    },
    loadAddresses: async selected => {
      assert.equal(selected.id, company.id);
      return [{ ...selected, addresses: [{ id: 'real-address', address: 'Rua SAC, 10' }, { id: 'other-address', address: 'Rua SAC, 20' }] }];
    },
    loadMachines: async selected => [{ ...selected, equipment: [{ id: '123', name: 'Scanner SAC', serial: '' }] }],
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const flow = fixture(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  const simulate = async (inputs: string[]) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/bots/simulate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flow, inputs }),
    });
    assert.equal(response.status, 200); return await response.json() as any;
  };
  try {
    const found = await simulate(['1', '60.934.551/0004-05']);
    assert.equal(found.state.sacTest.step, 'confirmCnpj');
    assert.equal(found.state.sacTest.data.companyId, 'real-tenant');
    assert.match(found.messages.at(-1).text, /Empresa: \*ab brasil\*/);
    assert.match(found.messages.at(-1).text, /no \*SAC\*/);
    assert.deepEqual(found.quickReplies, ['1', '2', '0']);
    const dynamic = await simulate(['1', company.cnpj, '1', 'Pessoa Teste', '27999999999']);
    assert.equal(dynamic.state.sacTest.step, 'address');
    assert.match(dynamic.messages.at(-1).text, /Rua SAC, 10/);
    assert.deepEqual(dynamic.quickReplies, ['1', '2', '0']);
    flow.menus[0]!.options[0]!.action = 'SAC_TICKET';
    const complete = await simulate(['1', company.cnpj, '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com', '1', 'Administrativo', 'Scanner não liga', '1']);
    assert.equal(complete.state.sacTest, undefined);
    assert.match(complete.messages.at(-1).text, /Nenhum chamado real foi aberto neste teste/);
    flow.menus[0]!.options[0]!.action = 'SAC_TEST';
    const unknown = await simulate(['1', '51864734000150']);
    assert.equal(unknown.state.sacTest.step, 'cnpj');
    assert.match(unknown.messages.at(-1).text, /não encontrado no SAC/);
    const before = requests.length;
    const invalid = await simulate(['1', '00000000000000']);
    assert.match(invalid.messages.at(-1).text, /CNPJ inválido/);
    assert.equal(requests.length, before);
    failing = true;
    const failure = await simulate(['1', company.cnpj]);
    assert.equal(failure.state.sacTest.step, 'cnpj');
    assert.match(failure.messages.at(-1).text, /Não foi possível consultar o SAC/);
    assert.doesNotMatch(JSON.stringify(failure), /upstream secrets/);
    const cancelled = await simulate(['1', 'cancelar']);
    assert.equal(cancelled.state.sacTest, undefined);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
