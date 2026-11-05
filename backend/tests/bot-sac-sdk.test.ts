import test from 'node:test';
import assert from 'node:assert/strict';
import { SacClient, type TenantCheck } from '../src/lib/sac/index.js';
import { createSacClient, listSacInvoicesByCnpj, findSacCompany, loadSacCompanyAddresses, loadSacMachines } from '../src/services/bot-sac.service.js';
import { advanceBot } from '../src/services/bot-flow.js';
import { fixture } from './bot-fixture.js';

function mockClient(checks: TenantCheck[]) {
  const requests: { url: string; authorization: string | null }[] = [];
  const client = new SacClient({ baseUrl: 'https://sac.example.com', token: 'test-token', fetch: async (url, init) => {
    requests.push({ url: String(url), authorization: new Headers(init?.headers).get('Authorization') });
    return new Response(JSON.stringify(String(url).includes('/check-tenant') ? checks : []), { status: 200 });
  } });
  return { client, requests };
}

test('SDK resolves the normalized CNPJ and lists invoices once with its tenant and Bearer token', async () => {
  const { client, requests } = mockClient([{ valido: true, IdTenant: 'tenant-a', TenantName: 'Empresa' }]);
  const result = await listSacInvoicesByCnpj('05.540.238/0001-23', client);
  assert.equal(result.status, 'found');
  assert.deepEqual(requests, [
    { url: 'https://sac.example.com/api/check-tenant?cnpj=05540238000123', authorization: 'Bearer test-token' },
    { url: 'https://sac.example.com/api/invoices?IdTenant=tenant-a', authorization: 'Bearer test-token' },
  ]);
});

test('invalid CNPJ, missing/null/invalid tenants and ambiguous tenants never query invoices', async () => {
  const invalid = mockClient([]);
  assert.equal((await listSacInvoicesByCnpj('', invalid.client)).status, 'invalid_cnpj');
  assert.equal(invalid.requests.length, 0);
  for (const checks of [[], [{ valido: true, IdTenant: null, TenantName: null }], [{ valido: false, IdTenant: 'a', TenantName: null }],
    [{ valido: true, IdTenant: 'a', TenantName: null }, { valido: true, IdTenant: 'b', TenantName: null }]]) {
    const { client, requests } = mockClient(checks);
    assert.notEqual((await listSacInvoicesByCnpj('05540238000123', client)).status, 'found');
    assert.equal(requests.length, 1);
  }
});

test('configuration requires URL and token and accepts SAC_API_TOKEN', () => {
  assert.throws(() => createSacClient({}), /SAC_BASE_URL e SAC_API_TOKEN/);
  assert.ok(createSacClient({ SAC_BASE_URL: 'https://sac.example.com', SAC_API_TOKEN: 'test-token' }));
});

test('SDK authentication failures propagate without returning invoices', async () => {
  const client = new SacClient({ baseUrl: 'https://sac.example.com', fetch: async () => new Response('{}', { status: 401 }) });
  await assert.rejects(listSacInvoicesByCnpj('05540238000123', client), { status: 401 });
});

test('opening a ticket resolves the SAC tenant and persists it through confirmation and JSON reload', async () => {
  const { client, requests } = mockClient([{ valido: true, IdTenant: 'tenant-a', TenantName: 'Empresa SAC' }]);
  const flow = fixture(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  let state = advanceBot(flow, null, '').state;
  state = advanceBot(flow, state, '1').state;
  const catalog = await findSacCompany('05.540.238/0001-23', client);
  state.sacTest!.source = 'sac'; state.sacTest!.catalog = catalog;
  const reply = advanceBot(flow, state, '05.540.238/0001-23', { catalog });
  assert.equal(reply.state.sacTest?.data.companyId, 'tenant-a');
  assert.equal(reply.state.sacTest?.step, 'confirmCnpj');
  assert.match(reply.text, /Empresa SAC/); assert.match(reply.text, /no \*SAC\*/);
  const reloaded = JSON.parse(JSON.stringify(reply.state));
  assert.equal(advanceBot(flow, reloaded, '1', { catalog: reloaded.sacTest.catalog }).state.sacTest?.step, 'requester');
  assert.equal(requests.length, 1);
});

test('unknown tenants do not advance collection and invalid CNPJ makes no GET', async () => {
  const { client, requests } = mockClient([]);
  assert.deepEqual(await findSacCompany('invalid', client), []); assert.equal(requests.length, 0);
  const catalog = await findSacCompany('05540238000123', client);
  const flow = fixture(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  const state = advanceBot(flow, advanceBot(flow, null, '').state, '1').state;
  state.sacTest!.source = 'sac';
  const reply = advanceBot(flow, state, '05540238000123', { catalog });
  assert.equal(reply.state.sacTest?.step, 'cnpj'); assert.match(reply.text, /não encontrado no SAC/);
});

test('address lookup is scoped to the resolved tenant and matching active CNPJ', async () => {
  let requested = '';
  const client = new SacClient({ baseUrl: 'https://sac.example.com', fetch: async url => {
    requested = String(url);
    const registration = { IdCliente: 10, ativo: true, cnpj: '05.540.238/0001-23', endereco: 'Rua A', numero: '12', enderecosEntrega: [] };
    return new Response(JSON.stringify([registration, { ...registration, IdCliente: 11, cnpj: '00000000000000' }]));
  } });
  const catalog = await loadSacCompanyAddresses({ id: 'tenant-a', cnpj: '05540238000123', equipment: [], addresses: [] }, client);
  assert.equal(requested, 'https://sac.example.com/api/tenants/register/tenant-a');
  assert.deepEqual(catalog[0]?.addresses, [{ id: 'client-10', address: 'Rua A, 12' }]);
});

test('SAC machine identifiers returned as strings are normalized without accepting malformed identifiers', async () => {
  const client = new SacClient({ baseUrl: 'https://sac.example.com', fetch: async () => new Response(JSON.stringify([
    { IdEstoque: '1462', Descricao: ['HD342114 | SCANNER C240', 'SCANNER C240'] },
    { IdEstoque: 15, Descricao: 'Scanner B' }, { IdEstoque: 'invalid', Descricao: 'Invalid' },
  ])) });
  const catalog = await loadSacMachines({ id: 'tenant-a', cnpj: '05540238000123', equipment: [], addresses: [] }, client);
  assert.deepEqual(catalog[0]?.equipment, [{ id: '1462', name: 'HD342114 | SCANNER C240', serial: '' }, { id: '15', name: 'Scanner B', serial: '' }]);
});
