/** Catálogo de demonstração ou snapshot dos cadastros consultados no SAC. */
export type SacTestCatalog = {
  id: string; cnpj: string; name?: string;
  equipment: { id: string; name: string; serial: string }[];
  addresses: { id: string; address: string }[];
}[];

// Mesmo cadastro da migration. Fallback do simulador sem configuração SAC.
export const SAC_TEST_CATALOG: SacTestCatalog = [{
  id: 'sac-demo-company', cnpj: '05540238000123', name: 'infordoc',
  equipment: [{ id: 'sac-demo-scanner', name: 'SCANNER C240 (40PPM)', serial: 'HD370664' }],
  addresses: [{ id: 'sac-demo-address', address: 'RODOVIA BR-262, S/N, 5030, , VILA CAPIXABA, 29145-901, CARIACICA - ES' }],
}];
