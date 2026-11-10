import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBot, validateFlow, type BotState } from '../src/services/bot-flow.js';
import { advanceSacLookup, findSacTicket, sacTechnicianTarget, resolveSacTechnicianTarget } from '../src/services/bot-sac-lookup.js';
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
  const f = flow(); const state = advanceBot(f, advanceBot(f, null, '').state, '1').state;
  const result = await advanceSacLookup(f, state, '19335', { phone, findTicket });
  return { f, result };
}

test('protocol alone returns status and responsible person and waits for consent', async () => {
  const { f, result } = await entered(); validateFlow(f, true);
  assert.equal(result.state.sacLookup?.step, 'transfer');
  assert.match(result.text, /Status: Aberto/); assert.match(result.text, /atendido por \*Jose Tecnico\*/);
  assert.match(result.text, /1 — Solicitar atendimento/); assert.doesNotMatch(result.text, /CNPJ|SERIE-PRIVADA|Scanner|MOTIVO-PRIVADO/);
  assert.equal(result.handoff, undefined); assert.equal(result.state.status, 'BOT_ACTIVE');
});
test('another number gets the same status and responsible person and its own conversation is handed off', async () => {
  const { f, result } = await entered('5511888888888');
  assert.match(result.text, /Jose Tecnico/); assert.match(result.text, /Aberto/);
  assert.doesNotMatch(result.text, /SERIE-PRIVADA|MOTIVO-PRIVADO|Scanner/);
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
  let calls = 0; const find = async () => { calls++; throw new Error('PRIVATE SERVER ERROR'); };
  await advanceSacLookup(f, state, 'invalid', { findTicket: find }); assert.equal(calls, 0);
  const failure = await advanceSacLookup(f, state, '19335', { findTicket: find });
  assert.equal(failure.state.sacLookup?.step, 'protocol'); assert.doesNotMatch(failure.text, /PRIVATE/);
  const missing = await advanceSacLookup(f, state, '19335', { findTicket: async () => null });
  assert.match(missing.text, /Chamados antigos/); assert.equal(missing.handoff, undefined);
  const support = await advanceSacLookup(f, missing.state, '1', { findTicket: find });
  assert.equal(support.state.status, 'WAITING_HUMAN'); assert.equal(support.handoff?.userId, undefined);
  assert.match(support.handoff!.note, /Não localizado/); assert.equal(calls, 1);
  const cancelled = await advanceSacLookup(f, state, '0', { findTicket: find });
  assert.equal(cancelled.state.sacLookup, undefined); assert.equal(calls, 1);
  assert.deepEqual(state.sacLookup, { step: 'protocol' });
});
test('protocol search falls back to authorized client tenants and tolerates identical duplicates', async () => {
  const urls: string[] = [];
  const client = new SacClient({ baseUrl: 'https://example.test', fetch: async url => {
    urls.push(String(url)); return new Response(JSON.stringify(String(url).endsWith('/tenants')
      ? [{ IdTenant: 'tenant-a' }, { IdTenant: 'tenant-b' }, { IdTenant: 'tenant-a' }, { IdTenant: '' }]
      : String(url).endsWith('=tenant-a') ? [] : [ticket, ticket]));
  } });
  assert.equal((await findSacTicket('19335', client))?.IdChamado, 19335);
  assert.deepEqual(urls.sort(), ['https://example.test/api/tenants', 'https://example.test/api/tickets?IdTenant=tenant-a', 'https://example.test/api/tickets?IdTenant=tenant-b'].sort());
});
test('recent protocol uses the authorized Infordoc aggregate without scanning all clients', async () => {
  const urls: string[] = [];
  const client = new SacClient({ baseUrl: 'https://example.test', fetch: async url => {
    urls.push(String(url)); return new Response(JSON.stringify(String(url).endsWith('/tenants')
      ? [{ IdTenant: 'client-a', tenantName: 'Client A' }, { IdTenant: 'aggregate', tenantName: 'infordoc' }] : [ticket]));
  } });
  assert.equal((await findSacTicket('19335', client))?.IdChamado, 19335);
  assert.deepEqual(urls, ['https://example.test/api/tenants', 'https://example.test/api/tickets?IdTenant=aggregate']);
});
test('partial search failures or conflicting responsible persons never produce a guessed transfer', async () => {
  for (const failing of [true, false]) {
    const client = new SacClient({ baseUrl: 'https://example.test', fetch: async url => {
      if (String(url).endsWith('/tenants')) return new Response(JSON.stringify([{ IdTenant: 'root' }, { IdTenant: 'a' }, { IdTenant: 'b' }]));
      if (String(url).endsWith('=root')) return new Response('[]');
      if (String(url).endsWith('=b')) return failing ? new Response('{}', { status: 503 }) : new Response(JSON.stringify([{ ...ticket, Tecnico: 'Outra pessoa' }]));
      return new Response(JSON.stringify(failing ? [] : [ticket]));
    } });
    await assert.rejects(findSacTicket('19335', client));
  }
});
test('invalid protocol and empty tenant access do not query ticket lists; legacy CNPJ stage restarts safely', async () => {
  let calls = 0;
  const client = new SacClient({ baseUrl: 'https://example.test', fetch: async () => { calls++; return new Response('[]'); } });
  assert.equal(await findSacTicket('invalid', client), null); assert.equal(calls, 0);
  assert.equal(await findSacTicket('19335', client), null); assert.equal(calls, 1);
  const f = flow(); const state: BotState = { menuId: f.rootMenuId, stack: [], status: 'BOT_ACTIVE', sacLookup: { step: 'cnpj', protocol: '19335' } };
  const result = await advanceSacLookup(f, state, '05540238000123', { findTicket: async () => { throw new Error('must not query'); } });
  assert.deepEqual(result.state.sacLookup, { step: 'protocol' });
});
test('routing validation rejects duplicate technician names, wrong types and the bot as destination', () => {
  const f = flow(); f.sacLookup!.technicians.push({ name: 'jose tecnico', userId: 'other', available: true });
  assert.throws(() => validateFlow(f), /duplicado/);
  const other = flow(); other.sacLookup!.fallbackUserId = 'bot'; assert.throws(() => validateFlow(other), /inválido/);
});

test('routing uses the member explicitly selected for the SAC technician, even when account names differ', () => {
  const f = flow(); f.sacLookup!.technicians = [{ name: 'Bruno Odorissi Campaner', userId: 'bruno', available: true }];
  const members = [{ userId: 'bruno', displayName: 'Bruno', user: { name: 'Bruno Odorissi Campaner' } }];
  assert.equal(resolveSacTechnicianTarget(f, 'BRUNO ODORISSI  CAMPANER', members), 'bruno');
  assert.equal(resolveSacTechnicianTarget(f, 'BRUNO ODORISSI CAMPANER', [{ ...members[0]!, displayName: 'Bruno Odorissi Campaner', user: { name: 'Outro nome' } }]), 'bruno');
  assert.equal(resolveSacTechnicianTarget(f, 'Bruno Campaner', members), undefined);
  assert.equal(resolveSacTechnicianTarget(f, 'Jose Tecnico', [{ userId: 'jose', user: { name: 'José Técnico' } }]), undefined);
});
test('configured routing excludes banned users and the bot and respects unavailability', () => {
  const f = flow();
  const member = { userId: 'tech-a', user: { name: 'Jose Tecnico', banned: false } };
  assert.equal(resolveSacTechnicianTarget(f, 'Jose Tecnico', [member, { ...member, userId: 'other' }]), 'tech-a');
  assert.equal(resolveSacTechnicianTarget(f, 'Jose Tecnico', [{ ...member, user: { ...member.user, banned: true } }]), undefined);
  assert.equal(resolveSacTechnicianTarget(f, 'Jose Tecnico', [{ ...member, userId: 'bot' }]), undefined);
  f.sacLookup!.fallbackUserId = 'support';
  f.sacLookup!.technicians = [{ name: 'Jose Tecnico', userId: 'tech-a', available: false }];
  assert.equal(resolveSacTechnicianTarget(f, 'Jose Tecnico', [member, { userId: 'support', user: { name: 'Suporte' } }]), 'support');
  f.sacLookup!.technicians[0]!.available = true;
  assert.equal(resolveSacTechnicianTarget(f, 'Jose Tecnico', [{ ...member, user: { name: 'Nome diferente no CotrimBot' } }]), 'tech-a');
});

test('the four configured first names identify SAC full names and route to the selected member IDs', () => {
  const f = flow();
  const pairs = [['Kaio', 'Kaio Cotrim'], ['Felype', 'Felype Souza'], ['Bruno', 'BRUNO ODORISSI CAMPANER'], ['Thiago', 'Thiago Praxedes']];
  f.sacLookup!.technicians = pairs.map(([name], index) => ({ name: name!, userId: `member-${index}`, available: true }));
  const members = pairs.map(([, name], index) => ({ userId: `member-${index}`, user: { name: name! } }));
  for (const [index, [, sacName]] of pairs.entries()) {
    assert.equal(resolveSacTechnicianTarget(f, sacName!, members), `member-${index}`);
    assert.equal(sacTechnicianTarget(f, sacName!), `member-${index}`);
  }
  assert.equal(resolveSacTechnicianTarget(f, 'Brunon Campaner', members), undefined);
  f.sacLookup!.technicians[2]!.available = false;
  assert.equal(resolveSacTechnicianTarget(f, 'BRUNO ODORISSI CAMPANER', members), undefined);
  f.sacLookup!.technicians[2]!.available = true;
  f.sacLookup!.technicians.push({ name: 'BRUNO ODORISSI CAMPANER', userId: 'member-2', available: false });
  assert.equal(resolveSacTechnicianTarget(f, 'BRUNO ODORISSI CAMPANER', members), undefined);
});
