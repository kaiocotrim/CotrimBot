import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBot, validateFlow } from '../src/services/bot-flow.js';
import type { SacTestState } from '../src/services/bot-sac-test.js';
import { sacTicketPayload, submitSacTicket } from '../src/services/bot-sac-submission.js';
import { SacApiError } from '../src/lib/sac/index.js';
import { fixture } from './bot-fixture.js';

const catalog = [{ id: 'tenant-a', cnpj: '05540238000123', name: 'Empresa SAC',
  equipment: [{ id: '123', name: 'Scanner', serial: '' }], addresses: [{ id: 'address-a', address: 'Rua SAC, 10' }] }];
function reviewed() {
  const flow = fixture(); flow.menus[0]!.options[0]!.action = 'SAC_TICKET'; validateFlow(flow, true);
  let reply = advanceBot(flow, null, '');
  for (const input of ['1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com', '1', 'Administrativo', 'Scanner não liga']) {
    reply = advanceBot(flow, reply.state, input, { catalog, messageId: '100' });
    if (reply.state.sacTest) { reply.state.sacTest.source = 'sac'; reply.state.sacTest.catalog = catalog; }
    assert.equal(reply.submitSacTicket, undefined);
  }
  return { flow, reply };
}
function ledger() {
  const records = new Map<number, any>();
  const database: any = { botSacSubmission: {
    findUnique: async ({ where }: any) => records.get(where.startMessageId) ?? null,
    create: async ({ data }: any) => {
      if (records.has(data.startMessageId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      records.set(data.startMessageId, structuredClone(data)); return data;
    },
    update: async ({ where, data }: any) => records.set(where.startMessageId, { ...records.get(where.startMessageId), ...data }),
  } };
  return { database, records };
}
const context = { botId: 'bot-a', contactId: 1, organizationId: 'company-a' };

test('real flow collects equipment, department and description and submits only after explicit review confirmation', () => {
  const { flow, reply } = reviewed();
  assert.equal(reply.state.sacTest?.step, 'review'); assert.match(reply.text, /Scanner não liga/);
  assert.equal(advanceBot(flow, reply.state, 'invalid', { catalog }).submitSacTicket, undefined);
  assert.equal(advanceBot(flow, reply.state, '1', { catalog }).submitSacTicket, true);
  assert.equal(advanceBot(flow, reply.state, '2', { catalog }).state.sacTest?.step, 'requester');
  assert.equal(advanceBot(flow, reply.state, '0', { catalog }).state.sacTest, undefined);
  assert.deepEqual(sacTicketPayload(reply.state.sacTest!), { IdTenant: 'tenant-a', IdEstoque: 123, Solicitante: 'Pessoa Teste',
    Motivo: 'Scanner não liga', Departamento: 'Administrativo', Telefone: '27999999999', Endereco: 'Rua SAC, 10',
    Email: 'teste@example.com', Maquina: 'Scanner', Origem: 'WhatsApp' });
});

test('large equipment catalogs are paginated and keep absolute selection numbers', () => {
  const { flow, reply } = reviewed();
  const large = structuredClone(catalog);
  large[0]!.equipment = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), name: `Scanner ${i + 1}`, serial: '' }));
  reply.state.sacTest!.step = 'equipment';
  const next = advanceBot(flow, reply.state, 'mais', { catalog: large });
  assert.equal(next.state.sacTest?.equipmentPage, 1);
  assert.match(next.text, /11 — Scanner 11/); assert.doesNotMatch(next.text, /21 — Scanner 21/);
  const selected = advanceBot(flow, next.state, '12', { catalog: large });
  assert.equal(selected.state.sacTest?.data.equipmentId, '12');
  assert.equal(advanceBot(flow, next.state, 'anterior', { catalog: large }).state.sacTest?.equipmentPage, 0);
});

test('successful SAC protocol is durable and a repeated confirmation never creates another ticket', async () => {
  const { database } = ledger(); const ticket = reviewed().reply.state.sacTest!;
  let posts = 0;
  const create = async () => { posts++; return [{ Protocolo: 98765 }]; };
  assert.deepEqual(await submitSacTicket(database, ticket, context, create), { status: 'SUCCEEDED', protocol: '98765' });
  assert.deepEqual(await submitSacTicket(database, ticket, context, create), { status: 'SUCCEEDED', protocol: '98765' });
  assert.equal(posts, 1);
  await assert.rejects(submitSacTicket(database, ticket, { ...context, contactId: 2 }, create), /outro atendimento/);
});

test('ambiguous timeout, unrecognized success and forbidden tenant are never posted again', async () => {
  for (const [create, expected] of [
    [async () => { throw new Error('timeout'); }, 'UNCERTAIN'],
    [async () => ({ message: 'unknown response' }), 'UNCERTAIN'],
    [async () => { throw new SacApiError(403, {}); }, 'REJECTED'],
  ] as const) {
    const { database } = ledger(); const ticket = reviewed().reply.state.sacTest!; let posts = 0;
    const post = async () => { posts++; return create(); };
    assert.equal((await submitSacTicket(database, ticket, context, post)).status, expected);
    assert.equal((await submitSacTicket(database, ticket, context, post)).status, expected);
    assert.equal(posts, 1);
  }
});

test('a failed protocol save preserves the original claim and prevents retries after restart', async () => {
  const { database, records } = ledger(); const ticket = reviewed().reply.state.sacTest!; let posts = 0;
  database.botSacSubmission.update = async () => { throw new Error('database unavailable'); };
  const create = async () => { posts++; return [{ Protocolo: 1234 }]; };
  await assert.rejects(submitSacTicket(database, ticket, context, create), /database unavailable/);
  assert.equal(records.get(100).status, 'PENDING');
  assert.equal((await submitSacTicket(database, ticket, context, create)).status, 'UNCERTAIN');
  assert.equal(posts, 1);
});
