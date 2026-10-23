/** Configuração de rotas externas versionada junto ao rascunho/publicação do bot. */
export type BotIntegrationRoute = {
  id: string; name: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; headers: string; body: string;
};
export type BotIntegrations = { baseUrl: string; tokenEnv: string; routes: BotIntegrationRoute[] };

export function defaultSacIntegrations(): BotIntegrations {
  return { baseUrl: '', tokenEnv: 'SAC_API_TOKEN', routes: [
    { id: 'company', name: 'Consultar empresa pelo CNPJ', method: 'GET', path: '/empresas?cnpj={{cnpj}}', headers: '{}', body: '' },
    { id: 'equipment', name: 'Consultar equipamentos', method: 'GET', path: '/empresas/{{empresaId}}/equipamentos', headers: '{}', body: '' },
    { id: 'addresses', name: 'Consultar endereços', method: 'GET', path: '/empresas/{{empresaId}}/enderecos', headers: '{}', body: '' },
    { id: 'createTicket', name: 'Criar chamado', method: 'POST', path: '/chamados', headers: '{"Content-Type":"application/json"}', body: JSON.stringify({ empresaId: '{{empresaId}}', equipamentoId: '{{equipamentoId}}', enderecoId: '{{enderecoId}}', solicitante: '{{solicitante}}', telefone: '{{telefone}}', email: '{{email}}', descricao: '{{motivo}}' }, null, 2) },
  ] };
}

export function validateBotIntegrations(value: unknown): asserts value is BotIntegrations {
  const fail = (message: string): never => { throw new Error('Integrações: ' + message); };
  if (!value || typeof value !== 'object') fail('configuração inválida.');
  const config = value as BotIntegrations;
  if (typeof config.baseUrl !== 'string' || config.baseUrl.length > 2000 || typeof config.tokenEnv !== 'string' || !/^(?:[A-Z][A-Z0-9_]{0,99})?$/.test(config.tokenEnv)
    || !Array.isArray(config.routes) || config.routes.length !== 4) fail('informe URL, variável de token e as quatro operações do chamado.');
  if (config.baseUrl) {
    let url: URL;
    try { url = new URL(config.baseUrl); } catch { fail('URL base inválida.'); }
    if (!['https:', 'http:'].includes(url!.protocol) || url!.username || url!.password || url!.search || url!.hash) fail('use uma URL HTTP/HTTPS sem credenciais, query ou fragmento.');
  }
  const ids = new Set<string>();
  for (const route of config.routes) {
    if (!route || typeof route.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(route.id) || ids.has(route.id)
      || typeof route.name !== 'string' || !route.name.trim() || route.name.length > 100
      || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)
      || typeof route.path !== 'string' || !route.path.startsWith('/') || route.path.startsWith('//') || route.path.includes('\\') || route.path.length > 2000
      || typeof route.headers !== 'string' || route.headers.length > 8000 || typeof route.body !== 'string' || route.body.length > 16000) fail('revise nome, método, caminho, cabeçalhos e corpo de cada rota.');
    ids.add(route.id);
    if (!['company', 'equipment', 'addresses', 'createTicket'].includes(route.id)) fail('operação de chamado desconhecida.');
    let headers: unknown;
    try { headers = JSON.parse(route.headers || '{}'); } catch { fail('os cabeçalhos precisam ser um objeto JSON.'); }
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)
      || Object.entries(headers).some(([key, v]) => !/^[a-zA-Z0-9-]+$/.test(key) || typeof v !== 'string' || /[\r\n]/.test(v))) fail('cabeçalhos inválidos.');
    // Credenciais ficam no servidor, referenciadas pelo nome da variável de ambiente.
    if (Object.keys(headers as object).some(key => /authorization|cookie|api.?key|token|secret/i.test(key))) fail('configure o token pela variável de ambiente, sem salvar credenciais nos cabeçalhos.');
    if (route.method === 'GET' && route.body.trim()) fail('GET não deve possuir corpo.');
    if (route.body.trim()) { try { JSON.parse(route.body); } catch { fail('o corpo precisa ser JSON válido. Use variáveis dentro de strings, como "{{cnpj}}".'); } }
  }
}

/** Monta uma prévia sem realizar chamadas externas, com codificação dos valores da URL. */
export function previewBotRoute(config: BotIntegrations, routeId: string, variables: Record<string, string>) {
  validateBotIntegrations(config);
  const route = config.routes.find(item => item.id === routeId);
  if (!route) throw new Error('Rota não encontrada.');
  const substitute = (text: string, encode = false) => text.replace(/\{\{([a-zA-Z][a-zA-Z0-9_.]*)\}\}/g, (_match, key: string) => {
    if (!Object.hasOwn(variables, key)) throw new Error(`Informe a variável ${key}.`);
    return encode ? encodeURIComponent(variables[key]!) : variables[key]!;
  });
  const map = (value: unknown): unknown => typeof value === 'string' ? substitute(value)
    : Array.isArray(value) ? value.map(map) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, v]) => [key, map(v)])) : value;
  return { method: route.method, url: config.baseUrl.replace(/\/$/, '') + substitute(route.path, true),
    headers: { ...map(JSON.parse(route.headers || '{}')) as object, ...(config.tokenEnv ? { Authorization: `Bearer [variável ${config.tokenEnv}]` } : {}) },
    ...(route.body.trim() ? { body: map(JSON.parse(route.body)) } : {}) };
}
