/** Testes de integração locais: HTTP e SDK reais, com SQLite em memória/temporário. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CotrimBotClient } from '../../dist/index.js';
import { openStore, validCnpj, ADDRESS, saveSession } from './store.mjs';
import { startTestServer } from './server.mjs';
import { createSacApi } from './sac-api.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('GETs consultam os dados fornecidos e POST grava somente após validação, sem duplicar', async () => {
  const db = openStore(':memory:');
  const server = await startTestServer(db);
  try {
    const sdk = new CotrimBotClient({ baseUrl: server.baseUrl });
    const sac = createSacApi(server.baseUrl);
    assert.equal(validCnpj('05.540.238/0001-23'), true);
    assert.equal(validCnpj('05.540.238/0001-24'), false);
    await assert.rejects(sac.company('00000000000000'), /inválido/);
    await assert.rejects(sac.company('11222333000181'), /não encontrado/);
    const company = await sac.company('05.540.238/0001-23');
    const [equipment] = await sac.equipment(company.id);
    const [address] = await sac.addresses(company.id);
    assert.equal(equipment.serial, 'HD370664');
    assert.equal(equipment.name, 'SCANNER C240 (40PPM)');
    assert.equal(address.address, ADDRESS);
    assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n, 0);
    const data = { requestId: 'test-1', companyId: company.id, equipmentId: equipment.id, addressId: address.id, requester: 'Pessoa Teste', phone: '27999999999', email: 'teste@example.com', description: 'Scanner não liga' };
    await assert.rejects(sac.createTicket({ ...data, equipmentId: 99 }), /mesmo cadastro/);
    await assert.rejects(sac.createTicket({ ...data, email: 'inválido' }), /e-mail inválido/);
    const ticket = await sac.createTicket(data);
    assert.equal(ticket.test_mode, 1);
    assert.equal((await sac.createTicket(data)).id, ticket.id);
    await assert.rejects(sac.createTicket({ ...data, description: 'Outro problema' }), /outros dados/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n, 1);
    await sdk.messages.sendText(1, { text: `Registro de teste #${ticket.id} salvo. Nenhum chamado foi aberto no SAC.` });
    assert.match(db.prepare('SELECT content FROM sdk_messages').get().content, /Nenhum chamado/);
  } finally { await server.close(); db.close(); }
});

test('sessão e cadastros persistem ao reabrir o banco sem duplicar os dados iniciais', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sac-sdk-test-'));
  let db;
  try {
    db = openStore(join(dir, 'test.sqlite'));
    saveSession(db, 'contact-1', { step: 'email', data: { requester: 'Pessoa Teste' } });
    db.close();
    db = openStore(join(dir, 'test.sqlite'));
    assert.equal(JSON.parse(db.prepare('SELECT state FROM sessions WHERE id = ?').get('contact-1').state).step, 'email');
    assert.equal(db.prepare('SELECT count(*) AS n FROM companies').get().n, 1);
  } finally { db?.close(); rmSync(dir, { recursive: true }); }
});
