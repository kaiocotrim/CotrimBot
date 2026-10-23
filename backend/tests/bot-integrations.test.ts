import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSacIntegrations, previewBotRoute, validateBotIntegrations } from '../src/services/bot-integrations.js';
import { validateFlow } from '../src/services/bot-flow.js';
import { fixture } from './bot-fixture.js';

test('quatro operações são versionadas no fluxo sem alterar menus antigos', () => {
  const flow = fixture(); validateFlow(flow, true);
  const before = structuredClone(flow.menus);
  const integrations = defaultSacIntegrations();
  integrations.baseUrl = 'https://api.example.com/v1';
  const next = JSON.parse(JSON.stringify({ ...flow, integrations }));
  validateFlow(next, true);
  assert.deepEqual(next.menus, before);
  assert.ok(next.integrations);
  assert.equal(next.integrations.routes.length, 4);
});

test('prévia codifica query e preserva texto no JSON sem executar chamadas', () => {
  const config = defaultSacIntegrations(); config.baseUrl = 'https://api.example.com';
  const get = previewBotRoute(config, 'company', { cnpj: '05/54?&' });
  assert.equal(get.url, 'https://api.example.com/empresas?cnpj=05%2F54%3F%26');
  assert.match(get.headers.Authorization!, /SAC_API_TOKEN/);
  const post = previewBotRoute(config, 'createTicket', { empresaId: '1', equipamentoId: '2', enderecoId: '3', solicitante: 'Maria "Teste"', telefone: '27999999999', email: 'teste@example.com', motivo: 'Erro\nsegunda linha' });
  assert.equal((post.body as any).solicitante, 'Maria "Teste"');
  assert.equal((post.body as any).descricao, 'Erro\nsegunda linha');
  assert.throws(() => previewBotRoute(config, 'equipment', {}), /empresaId/);
});

test('rejeita credenciais no JSON, URLs inválidas e contratos malformados', () => {
  for (const change of [
    (c: ReturnType<typeof defaultSacIntegrations>) => { c.baseUrl = 'https://user:password@example.com'; },
    (c: ReturnType<typeof defaultSacIntegrations>) => { c.routes[0]!.headers = '{"Authorization":"Bearer segredo"}'; },
    (c: ReturnType<typeof defaultSacIntegrations>) => { c.routes[0]!.headers = '[]'; },
    (c: ReturnType<typeof defaultSacIntegrations>) => { c.routes[0]!.path = '//outro-host'; },
    (c: ReturnType<typeof defaultSacIntegrations>) => { c.routes[0]!.body = '{}'; },
    (c: ReturnType<typeof defaultSacIntegrations>) => { c.routes[3]!.body = 'JSON quebrado'; },
    (c: ReturnType<typeof defaultSacIntegrations>) => { c.routes[1]!.id = 'company'; },
  ]) { const config = defaultSacIntegrations(); change(config); assert.throws(() => validateBotIntegrations(config), /Integrações/); }
});
