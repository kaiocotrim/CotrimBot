/**
 * Servidor HTTP local com dois conjuntos de rotas:
 * /sac/* simula consultas e criação no SAC; /api/contacts/:id/send recebe o SDK.
 * Não encaminha nenhuma requisição a serviços externos.
 */
import { createServer } from 'node:http';
import { validCnpj, validPhone } from './store.mjs';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Lê o JSON recebido com limite de 32 KB e diferencia corpo inválido de erro interno. */
async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 32768) throw new ApiError(413, 'Corpo acima de 32 KB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ApiError(400, 'JSON inválido.'); }
}

/** Sobe uma API em porta livre no computador local; retorna a URL e a função close(). */
export async function startTestServer(db) {
  const server = createServer(async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      console.log(`[API local] ${req.method} ${url.pathname}`);
      if (req.method === 'GET' && url.pathname === '/sac/companies') {
        // GET 1: localizar o cadastro pelo CNPJ já validado, usando parâmetro SQL.
        const cnpj = url.searchParams.get('cnpj') ?? '';
        if (!validCnpj(cnpj)) throw new ApiError(400, 'CNPJ inválido.');
        const company = db.prepare('SELECT * FROM companies WHERE cnpj = ?').get(cnpj.replace(/\D/g, ''));
        if (!company) throw new ApiError(404, 'CNPJ não encontrado na base de teste.');
        return reply(200, company);
      }
      const collection = /^\/sac\/companies\/(\d+)\/(equipment|addresses)$/.exec(url.pathname);
      if (req.method === 'GET' && collection) {
        // GETs 2 e 3: listar apenas registros associados à empresa solicitada.
        // O nome da tabela vem destas duas constantes, nunca diretamente do usuário.
        const table = collection[2] === 'equipment' ? 'equipment' : 'addresses';
        return reply(200, db.prepare(`SELECT * FROM ${table} WHERE company_id = ?`).all(Number(collection[1])));
      }
      if (req.method === 'POST' && url.pathname === '/sac/tickets') {
        // O servidor revalida o payload: validar no terminal sozinho não é suficiente.
        const body = await readJson(req);
        if (!body || typeof body !== 'object') throw new ApiError(400, 'Dados inválidos.');
        for (const key of ['requestId', 'requester', 'phone', 'email', 'description']) {
          if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 8000) throw new ApiError(400, `Campo inválido: ${key}.`);
        }
        if (!validPhone(body.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new ApiError(400, 'Telefone ou e-mail inválido.');
        const { companyId, equipmentId, addressId } = body;
        if (![companyId, equipmentId, addressId].every(Number.isSafeInteger)) throw new ApiError(400, 'Identificadores inválidos.');
        const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(companyId);
        const equipment = db.prepare('SELECT id FROM equipment WHERE id = ? AND company_id = ?').get(equipmentId, companyId);
        const address = db.prepare('SELECT id FROM addresses WHERE id = ? AND company_id = ?').get(addressId, companyId);
        if (!company || !equipment || !address) throw new ApiError(400, 'Empresa, equipamento e endereço precisam pertencer ao mesmo cadastro.');
        // Idempotência: repetir a mesma intenção retorna o chamado já salvo.
        // Reutilizar a chave com dados diferentes retorna conflito (HTTP 409).
        const existing = db.prepare('SELECT * FROM tickets WHERE request_id = ?').get(body.requestId);
        if (existing) {
          if (existing.company_id !== companyId || existing.equipment_id !== equipmentId || existing.address_id !== addressId || existing.requester !== body.requester || existing.phone !== body.phone || existing.email !== body.email || existing.description !== body.description) throw new ApiError(409, 'Identificador já utilizado com outros dados.');
          return reply(200, existing);
        }
        const result = db.prepare('INSERT INTO tickets (request_id, company_id, equipment_id, address_id, requester, phone, email, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(body.requestId, companyId, equipmentId, addressId, body.requester, body.phone, body.email, body.description);
        return reply(201, db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid));
      }
      const send = /^\/api\/contacts\/(\d+)\/send$/.exec(url.pathname);
      if (req.method === 'POST' && send) {
        // Destino simulado de sdk.messages.sendText(). Grava e imprime, sem Evolution.
        const body = await readJson(req);
        if (typeof body?.text !== 'string' || !body.text.trim()) throw new ApiError(400, 'Texto obrigatório.');
        const result = db.prepare('INSERT INTO sdk_messages (contact_id, content) VALUES (?, ?)').run(Number(send[1]), body.text);
        console.log(`\nBot: ${body.text}\n`);
        return reply(200, { id: Number(result.lastInsertRowid), content: body.text, mode: 'TEST' });
      }
      throw new ApiError(404, 'Rota de teste inexistente.');
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Falha interna na API de teste.');
      reply(error instanceof ApiError ? error.status : 500, { message: error instanceof ApiError ? error.message : 'Falha interna.' });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    // Porta 0 pede uma porta livre ao sistema; 127.0.0.1 restringe ao computador local.
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }),
  };
}
