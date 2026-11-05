import { normalizeSacTestPhone, validSacTestCnpj, validSacTestPhone, validSacTestName, validSacTestEmail } from './bot-sac-test-validation.js';
import { sacTestPrompt, formatSacTestAddress } from './bot-sac-test-messages.js';
export { validSacTestCnpj, validSacTestPhone } from './bot-sac-test-validation.js';
export { sacTestPrompt } from './bot-sac-test-messages.js';
/**
 * Coleta de chamado em modo de teste, compartilhada entre simulador e WhatsApp.
 * Este módulo só calcula transições: não envia mensagens nem grava no banco.
 * O runtime carrega o catálogo do MySQL e persiste a coleta em BotSession.
 */
import type { BotReply, BotState } from './bot-flow.js';

import type { SacTestCatalog } from './bot-sac-test-catalog.js';
export { SAC_TEST_CATALOG, type SacTestCatalog } from './bot-sac-test-catalog.js';
export type SacTestData = {
  companyId: string; cnpj: string; companyName: string; requester: string; phone: string; email: string;
  addressId: string; addressLabel: string;
  equipmentId: string; equipmentLabel: string; department: string; description: string;
};
type Step = 'cnpj' | 'confirmCnpj' | 'requester' | 'phone' | 'address' | 'email' | 'nextStep' | 'equipment' | 'department' | 'description' | 'review';
export type SacTestState = {
  step: Step;
  startMessageId: string;
  data: Partial<SacTestData>;
  source?: 'sac';
  catalog?: SacTestCatalog;
  real?: boolean;
  equipmentPage?: number;
};

export function startSacTest(state: BotState, startMessageId: string, catalog: SacTestCatalog, real = false): BotReply {
  const ticket: SacTestState = { step: 'cnpj', data: {}, startMessageId, ...(real ? { real: true } : {}) };
  return { state: { ...state, sacTest: ticket }, text: sacTestPrompt(ticket, catalog) };
}

export function advanceSacTest(state: BotState, input: string, catalog: SacTestCatalog, inputType = 'TEXT'): BotReply {
  // Copiamos o estado para não modificar o snapshot anterior da sessão/simulação.
  const ticket = structuredClone(state.sacTest!);
  const next = { ...state, sacTest: ticket };
  const reply = (error = ''): BotReply => ({ state: next, text: (error ? (error.startsWith('✅') ? error : '⚠️ ' + error) + '\n\n' : '') + sacTestPrompt(ticket, catalog) });
  const text = input.trim();
  if (inputType !== 'TEXT') return reply('Nesta versão, envie uma resposta em texto. Anexos ainda não são aceitos.');
  if (text === '0' || text.toLocaleLowerCase('pt-BR') === 'cancelar') {
    const { sacTest: discarded, ...clean } = state;
    return { state: { ...clean, stack: [] }, text: '❌ *Atendimento cancelado.*\n\nSua solicitação de abertura de chamado foi cancelada.\n\nNenhum chamado foi aberto no SAC.\n\nPara iniciar um novo atendimento, retorne ao menu principal do InforBot.\n\n0 — ↩️ Menu principal' };
  }
  const legacy = ticket as SacTestState & { cancelPending?: boolean; editing?: boolean };
  delete legacy.cancelPending;
  delete legacy.editing;
  if (!ticket.real && ['equipment', 'description', 'review', 'edit'].includes(ticket.step)) ticket.step = ticket.data.email ? 'nextStep' : 'email';
  if (ticket.real && ticket.step === 'nextStep') ticket.step = 'email';
  if (ticket.step === 'nextStep') return reply();
  if (/^abrir chamado$/i.test(text)) return reply('Você já está preenchendo um chamado. Continue abaixo ou digite cancelar.');
  if (!text || text.length > 8000) return reply('Informe uma resposta de 1 a 8000 caracteres.');
  const finishField = (nextStep: Step) => { ticket.step = nextStep; };
  const company = catalog.find(item => item.id === ticket.data.companyId);
  switch (ticket.step) {
    case 'cnpj': {
      if (!validSacTestCnpj(text)) return reply('CNPJ inválido. Confira os 14 números e os dígitos verificadores.');
      const found = catalog.find(item => item.cnpj === text.replace(/\D/g, ''));
      if (!found) return reply(`CNPJ não encontrado ${ticket.source === 'sac' ? 'no SAC' : 'na base de teste'}. Confira o número ou cancele para retornar ao menu principal.`);
      ticket.data = { companyId: found.id, cnpj: found.cnpj, ...(found.name ? { companyName: found.name } : {}) };
      ticket.step = 'confirmCnpj';
      return reply();
    }
    case 'confirmCnpj':
      if (text === '2') { ticket.data = {}; ticket.step = 'cnpj'; return reply(); }
      if (text !== '1') return reply('Escolha 1 para confirmar ou 2 para corrigir.');
      finishField('requester'); return reply();
    case 'requester':
      if (!validSacTestName(text)) return reply('Nome inválido. Informe seu nome completo, usando letras.');
      ticket.data.requester = text; finishField('phone'); return reply();
    case 'phone':
      if (!validSacTestPhone(text)) return reply('Telefone inválido. Informe DDD e telefone brasileiro, por exemplo 27999999999.');
      if (!company?.addresses.some(item => formatSacTestAddress(item.address))) return reply(`Não há endereço cadastrado para este CNPJ ${ticket.source === 'sac' ? 'no SAC' : 'na base de teste'}. Seus dados foram mantidos. Tente novamente após a correção do cadastro ou cancele para retornar ao menu principal.`);
      ticket.data.phone = normalizeSacTestPhone(text); finishField('address'); return reply();
    case 'email':
      if (!validSacTestEmail(text)) return reply('E-mail inválido. Exemplo: nome@empresa.com.br.');
      if (ticket.real && !company?.equipment.length) return reply('Não há equipamento disponível para abrir chamado. Confira o cadastro no SAC ou tente novamente.');
      ticket.data.email = text; finishField(ticket.real ? 'equipment' : 'nextStep'); return reply();
    case 'equipment': {
      const page = ticket.equipmentPage ?? 0;
      const lastPage = Math.max(0, Math.ceil((company?.equipment.length ?? 0) / 10) - 1);
      if (/^(mais|anterior)$/i.test(text)) {
        ticket.equipmentPage = Math.max(0, Math.min(lastPage, page + (text.toLowerCase() === 'mais' ? 1 : -1)));
        return reply();
      }
      const selected = /^[1-9]\d*$/.test(text) ? company?.equipment[Number(text) - 1] : undefined;
      if (!selected) return reply('Selecione um equipamento pelo número apresentado.');
      ticket.data.equipmentId = selected.id;
      ticket.data.equipmentLabel = [selected.name, selected.serial].filter(Boolean).join(' | ');
      finishField('department'); return reply();
    }
    case 'department':
      if (text.length > 100) return reply('Informe um setor de até 100 caracteres.');
      ticket.data.department = text; finishField('description'); return reply();
    case 'description':
      if (text.length < 5 || text.length > 4000) return reply('Descreva o problema usando de 5 a 4000 caracteres.');
      ticket.data.description = text; finishField('review'); return reply();
    case 'review':
      if (text === '2') { finishField('requester'); return reply(); }
      if (text !== '1') return reply('Escolha 1 para abrir o chamado, 2 para corrigir os dados ou 0 para cancelar.');
      return { state: next, text: '', submitSacTicket: true };
    case 'address': {
      const addresses = company?.addresses.filter(item => formatSacTestAddress(item.address)) ?? [];
      if (!addresses.length) return reply('Não há endereço cadastrado para este CNPJ. Tente novamente após a correção do cadastro ou cancele para retornar ao menu principal.');
      const selected = /^[1-9]\d*$/.test(text) ? addresses[Number(text) - 1] : undefined;
      if (!selected) return reply('Selecione um endereço pelo número apresentado.');
      ticket.data.addressId = selected.id; ticket.data.addressLabel = formatSacTestAddress(selected.address);
      finishField('email'); return reply();
    }
  }
  return reply();
}
