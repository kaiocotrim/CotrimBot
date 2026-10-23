/** Banco SQLite exclusivo do exemplo; não usa Prisma nem o MySQL do CotrimBot. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const ADDRESS = 'RODOVIA BR-262, S/N, 5030, , VILA CAPIXABA, 29145-901, CARIACICA - ES';

/**
 * Abre/cria o banco e cadastra os dados fornecidos pelo usuário.
 * @param {string} path Caminho do arquivo ou ':memory:' para testes sem persistência.
 * @returns {DatabaseSync} Conexão que o chamador deve fechar com db.close().
 */
export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // IF NOT EXISTS e INSERT OR IGNORE permitem reabrir sem duplicar o cadastro.
  // As chaves estrangeiras ligam equipamento/endereço à empresa.
  // tickets contém registros finais; sessions guarda preenchimentos incompletos.
  // sdk_messages é o histórico das mensagens simuladas, não do WhatsApp real.
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY, cnpj TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS equipment (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), name TEXT NOT NULL, serial TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS addresses (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), address TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      equipment_id INTEGER NOT NULL REFERENCES equipment(id),
      address_id INTEGER NOT NULL REFERENCES addresses(id),
      requester TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, description TEXT NOT NULL,
      test_mode INTEGER NOT NULL DEFAULT 1 CHECK (test_mode = 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sdk_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT OR IGNORE INTO companies VALUES (1, '05540238000123');
    INSERT OR IGNORE INTO equipment VALUES (1, 1, 'SCANNER C240 (40PPM)', 'HD370664');
  `);
  db.prepare('INSERT OR IGNORE INTO addresses VALUES (1, 1, ?)').run(ADDRESS);
  return db;
}

/** Valida CNPJ numérico e seus dois dígitos verificadores; não consulta o SAC. */
export function validCnpj(value) {
  const number = String(value).replace(/[.\/\-\s]/g, '');
  if (!/^\d{14}$/.test(number) || /^(\d)\1+$/.test(number)) return false;
  let base = number.slice(0, 12);
  for (let size = 12; size < 14; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(base[i]) * ((size - i - 1) % 8 + 2);
    const digit = 11 - sum % 11;
    base += digit >= 10 ? 0 : digit;
  }
  return number === base;
}

/** Verificação básica de formato brasileiro (DDD + fixo/celular); não confirma titularidade. */
export function validPhone(value) {
  return /^(?:55)?[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(String(value).replace(/[\s()+-]/g, ''));
}

/** Salva o estado em JSON; o mesmo identificador atualiza a sessão existente. */
export function saveSession(db, id, state) {
  db.prepare('INSERT INTO sessions (id, state) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP').run(id, JSON.stringify(state));
}
