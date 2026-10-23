/**
 * Cliente da API SAC simulada. É separado do SDK do CotrimBot porque são serviços
 * diferentes. As rotas abaixo foram criadas para o teste; não são rotas oficiais.
 * Esta interface será adaptada à documentação real do SAC posteriormente.
 */
export function createSacApi(baseUrl) {
  // Sem corpo: GET padrão do fetch. Com corpo: POST enviando JSON.
  async function request(path, body) {
    const response = await fetch(`${baseUrl}/sac${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? `HTTP ${response.status}`);
    return data;
  }
  return {
    // Primeiro buscamos a empresa pelo CNPJ; depois usamos seu ID nas demais consultas.
    company: cnpj => request(`/companies?cnpj=${encodeURIComponent(cnpj)}`),
    equipment: companyId => request(`/companies/${companyId}/equipment`),
    addresses: companyId => request(`/companies/${companyId}/addresses`),
    // Executado somente após a confirmação no resumo da conversa.
    createTicket: data => request('/tickets', data),
  };
}
