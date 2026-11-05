import { SacClient, type Invoice, type TenantCheck } from '../lib/sac/index.js';
import { validSacTestCnpj } from './bot-sac-test-validation.js';
import type { SacTestCatalog } from './bot-sac-test-catalog.js';

export type SacLookupClient = Pick<SacClient, 'tenants' | 'invoices'>;
export function sacConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SAC_BASE_URL || env.SAC_API_TOKEN || env.SAC_TOKEN);
}

export async function findSacCompany(cnpj: string, sac = createSacClient()): Promise<SacTestCatalog> {
  if (!validSacTestCnpj(cnpj)) return [];
  const checks = await sac.tenants.checkByCnpj(cnpj.replace(/\D/g, ''));
  const tenants = checks.filter(item => item.valido && item.IdTenant?.trim());
  if (new Set(tenants.map(item => item.IdTenant)).size > 1) throw new Error('CNPJ associado a múltiplos tenants.');
  const tenant = tenants[0];
  if (!tenant?.IdTenant) return [];
  return [{ id: tenant.IdTenant, cnpj: cnpj.replace(/\D/g, ''), name: tenant.TenantName ?? '', equipment: [], addresses: [] }];
}

export async function loadSacCompanyAddresses(company: SacTestCatalog[number], sac = createSacClient()): Promise<SacTestCatalog> {
  const clients = await sac.clients.list(company.id);
  const matching = clients.filter(client => client.ativo && client.cnpj.replace(/\D/g, '') === company.cnpj);
  const addresses = matching.flatMap(client => [{
    id: `client-${client.IdCliente}`,
    address: [client.endereco, client.numero, client.complemento, client.bairro, client.cep, client.cidade, client.uf].filter(Boolean).join(', '),
  }, ...client.enderecosEntrega.filter(item => item.entrega).map(item => ({
    id: `delivery-${item.IdClienteEnd}`,
    address: [item.enderecoEntrega, item.numeroEntrega, item.complementoEntrega, item.bairroEntrega, item.cepEntrega, item.cidadeEntrega, item.ufEntrega].filter(Boolean).join(', '),
  }))]).filter(item => item.address.trim());
  return [{ ...company, addresses }];
}

export async function loadSacMachines(company: SacTestCatalog[number], sac = createSacClient()): Promise<SacTestCatalog> {
  const machines = await sac.machines.list(company.id);
  const equipment = machines.filter(item => /^\d+$/.test(String(item.IdEstoque)) && Number.isSafeInteger(Number(item.IdEstoque)) && Number(item.IdEstoque) > 0).map(item => ({
    id: String(item.IdEstoque), name: Array.isArray(item.Descricao) ? item.Descricao.find(Boolean) ?? 'Equipamento' : item.Descricao, serial: '',
  }));
  return [{ ...company, equipment }];
}
export type SacInvoicesResult =
  | { status: 'invalid_cnpj' | 'not_found' | 'ambiguous' }
  | { status: 'found'; tenant: TenantCheck & { IdTenant: string }; invoices: Invoice[] };

/** Lazy configuration allows bots without SAC integration to keep running. */
export function createSacClient(env: NodeJS.ProcessEnv = process.env): SacClient {
  const baseUrl = env.SAC_BASE_URL?.trim();
  const token = env.SAC_API_TOKEN?.trim() || env.SAC_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error('Configure SAC_BASE_URL e SAC_API_TOKEN no servidor.');
  return new SacClient({
    baseUrl,
    token,
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }),
  });
}

/** Never call invoices.list with an absent tenant: that can remove its filter. */
export async function listSacInvoicesByCnpj(cnpj: string, client?: SacLookupClient): Promise<SacInvoicesResult> {
  if (!validSacTestCnpj(cnpj)) return { status: 'invalid_cnpj' };
  const sac = client ?? createSacClient();
  const checks = await sac.tenants.checkByCnpj(cnpj.replace(/\D/g, ''));
  const tenants = checks.filter((item): item is TenantCheck & { IdTenant: string } =>
    item.valido === true && typeof item.IdTenant === 'string' && Boolean(item.IdTenant.trim()));
  if (!tenants.length) return { status: 'not_found' };
  const ids = new Set(tenants.map(item => item.IdTenant));
  if (ids.size > 1) return { status: 'ambiguous' };
  const tenant = tenants[0]!;
  const invoices = await sac.invoices.list(tenant.IdTenant);
  return { status: 'found', tenant, invoices };
}
