import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBot, validateFlow, type BotState } from '../src/services/bot-flow.js';
import { advanceSacLookup, findSacTicket, sacTechnicianTarget } from '../src/services/bot-sac-lookup.js';
import { SacClient, type Ticket } from '../src/lib/sac/index.js';
import { fixture } from './bot-fixture.js';

function flow() {
  const f = fixture(); f.menus[0]!.options[0]!.action = 'SAC_LOOKUP';
  f.assignedUserId = 'bot';
  f.sacLookup = { fallbackUserId: '', technicians: [{ name: 'José Técnico', userId: 'tech-a', available: true }] };
  return f;
}
const ticket = { IdChamado: 19335, Tecnico: 'Jose Tecnico', FoneContato: '11999999999', StatusChamado: 'Aberto',
  Equipamento: 'Scanner', NrSerie: 'SERIE-PRIVADA', Motivo: 'MOTIVO-PRIVADO' } as Ticket;
const findTicket = async () => ticket;
async function entered(phone = '5511999999999') {
  const f = flow(); let state = advanceBot(f, advanceBot(f, null, '').state, '1').state;
  state = (await advanceSacLookup(f, state, '19335')).state;
  const result = await advanceSacLookup(f, state, '05.540.238/0001-23', { phone, findTicket });
  return { f, result };
}

test('lookup asks protocol then CNPJ, exposes summary only to matching phone and waits for consent', async () => {
  const { f, result } = await entered(); validateFlow(f, true);
  assert.equal(result.state.sacLookup?.step, 'transfer');
  assert.match(result.text, /SERIE-PRIVADA/); assert.match(result.text, /técnico responsável/);
  assert.equal(result.handoff, undefined); assert.equal(result.state.status, 'BOT_ACTIVE');
});
test('another number gets no ticket details and can request a verified human handoff', async () => {
  const { f, result } = await entered('5511888888888');
  assert.doesNotMatch(result.text, /SERIE-PRIVADA|MOTIVO-PRIVADO|Jose Tecnico|Scanner|Aberto/);
  const confirmed = await advanceSacLookup(f, result.state, '1', { findTicket, phone: '5511888888888' });
  assert.equal(confirmed.handoff?.userId, 'tech-a');
  assert.match(confirmed.handoff!.note, /confirmar autorização/);
  assert.equal(confirmed.state.status, 'WAITING_HUMAN');
});
test('confirmation refreshes responsible technician; missing/unavailable technician uses unassigned queue', async () => {
  for (const technician of [null, 'Outro técnico']) {
    const { f, result } = await entered();
    const reply = await advanceSacLookup(f, result.state, '1', { findTicket: async () => ({ ...ticket, Tecnico: technician }) });
    assert.ok(reply.handoff); assert.equal(reply.handoff.userId, undefined); assert.match(reply.text, /fila de suporte/);
  }
  const f = flow(); f.sacLookup!.technicians[0]!.available = false;
  assert.equal(sacTechnicianTarget(f, ticket.Tecnico), undefined);
  f.sacLookup!.fallbackUserId = 'support';
  assert.equal(sacTechnicianTarget(f, ticket.Tecnico), 'support');
});
test('deleted or foreign member cannot be a handoff destination', async () => {
  const { f, result } = await entered();
  const reply = await advanceSacLookup(f, result.state, '1', { findTicket, resolveTarget: async () => undefined });
  assert.equal(reply.handoff?.userId, undefined); assert.equal(reply.state.status, 'WAITING_HUMAN');
});
test('invalid input, errors and missing ticket preserve progress; cancellation never queries SAC', async () => {
  const f = flow(); const state: BotState = { menuId: f.rootMenuId, stack: [], status: 'BOT_ACTIVE', sacLookup: { step: 'protocol' } };
  for (const value of ['abc', '-1', '1.2', '99999999999999999']) assert.equal((await advanceSacLookup(f, state, value)).state.sacLookup?.step, 'protocol');
  const cnpj = (await advanceSacLookup(f, state, '19335')).state;
  let calls = 0; const find = async () => { calls++; throw new Error('PRIVATE SERVER ERROR'); };
  await advanceSacLookup(f, cnpj, 'invalid', { findTicket: find }); assert.equal(calls, 0);
  const failure = await advanceSacLookup(f, cnpj, '05540238000123', { findTicket: find });
  assert.equal(failure.state.sacLookup?.step, 'cnpj'); assert.doesNotMatch(failure.text, /PRIVATE/);
  const missing = await advanceSacLookup(f, cnpj, '05540238000123', { findTicket: async () => null });
  assert.match(missing.text, /Chamados antigos/); assert.equal(missing.handoff, undefined);
  const support = await advanceSacLookup(f, missing.state, '1', { findTicket: find });
  assert.equal(support.state.status, 'WAITING_HUMAN'); assert.equal(support.handoff?.userId, undefined);
  assert.match(support.handoff!.note, /Não localizado/); assert.equal(calls, 1);
  const cancelled = await advanceSacLookup(f, cnpj, '0', { findTicket: find });
  assert.equal(cancelled.state.sacLookup, undefined); assert.equal(calls, 1);
  assert.deepEqual(state.sacLookup, { step: 'protocol' });
});
test('lookup never falls back to unscoped tickets or accepts ambiguous tenants', async () => {
  for (const checks of [[], [{ valido: true, IdTenant: 'a' }, { valido: true, IdTenant: 'b' }]]) {
    const urls: string[] = [];
    const client = new SacClient({ baseUrl: 'https://example.test', fetch: async url => { urls.push(String(url)); return new Response(JSON.stringify(checks)); } });
    assert.equal(await findSacTicket('05540238000123', '19335', client), null);
    assert.equal(urls.length, 1);
  }
  const urls: string[] = [];
  const client = new SacClient({ baseUrl: 'https://example.test', fetch: async url => {
    urls.push(String(url)); return new Response(JSON.stringify(urls.length === 1 ? [{ valido: true, IdTenant: 'tenant-a' }] : [ticket]));
  } });
  assert.equal((await findSacTicket('05540238000123', '19335', client))?.IdChamado, 19335);
  assert.match(urls[1]!, /tickets\?IdTenant=tenant-a$/);
});
test('routing validation rejects duplicate technician names, wrong types and the bot as destination', () => {
  const f = flow(); f.sacLookup!.technicians.push({ name: 'jose tecnico', userId: 'other', available: true });
  assert.throws(() => validateFlow(f), /duplicado/);
  const other = flow(); other.sacLookup!.fallbackUserId = 'bot'; assert.throws(() => validateFlow(other), /inválido/);
});
