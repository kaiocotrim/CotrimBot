/**
 * Coleta de chamado em modo de teste, compartilhada entre simulador e WhatsApp.
 * Este módulo só calcula transições: não envia mensagens nem grava no banco.
 * O runtime carrega o catálogo do MySQL e persiste a submissão após confirmação.
 */
import type { BotReply, BotState } from './bot-flow.js';

export type SacTestCatalog = {
  id: string; cnpj: string;
  equipment: { id: string; name: string; serial: string }[];
  addresses: { id: string; address: string }[];
}[];

// Mesmo cadastro da migration. Usado apenas no simulador, sem consultas externas.
export const SAC_TEST_CATALOG: SacTestCatalog = [{
  id: 'sac-demo-company', cnpj: '05540238000123',
  equipment: [{ id: 'sac-demo-scanner', name: 'SCANNER C240 (40PPM)', serial: 'HD370664' }],
  addresses: [{ id: 'sac-demo-address', address: 'RODOVIA BR-262, S/N, 5030, , VILA CAPIXABA, 29145-901, CARIACICA - ES' }],
}];

export type SacTestData = {
  companyId: string; cnpj: string; requester: string; phone: string; email: string;
  equipmentId: string; equipmentLabel: string; addressId: string; addressLabel: string; description: string;
};
type Field = 'cnpj' | 'requester' | 'phone' | 'address' | 'email' | 'equipment' | 'description';
type Step = Field | 'confirmCnpj' | 'review' | 'edit';
export type SacTestState = {
  step: Step;
  startMessageId: string;
  data: Partial<SacTestData>;
  cancelPending?: boolean;
  editing?: boolean;
};
export type SacTestSubmission = { startMessageId: string; data: SacTestData };

export function validSacTestCnpj(value: string): boolean {
  const digits = value.replace(/[.\/\-\s]/g, '');
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let base = digits.slice(0, 12);
  for (let size = 12; size < 14; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(base[i]) * ((size - i - 1) % 8 + 2);
    const digit = 11 - sum % 11;
    base += digit >= 10 ? 0 : digit;
  }
  return base === digits;
}

export function validSacTestPhone(value: string): boolean {
  return /^(?:55)?[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(value.replace(/[\s()+-]/g, ''));
}

const fields: Field[] = ['cnpj', 'requester', 'phone', 'address', 'email', 'equipment', 'description'];
const labels = ['CNPJ', 'Solicitante', 'Telefone', 'Endereço', 'E-mail', 'Equipamento/Software', 'Motivo'];
const cancelPrompt = '⚠️ *Cancelar abertura de chamado?*\n\nSe cancelar, os dados deste preenchimento serão descartados.\n\n1 — Sim, cancelar\n2 — Não, continuar';
const footer = '\n\n0 ou cancelar — Cancelar atendimento';

export function sacTestPrompt(ticket: SacTestState, catalog: SacTestCatalog): string {
  if (ticket.cancelPending) return cancelPrompt;
  const data = ticket.data;
  const company = catalog.find(item => item.id === data.companyId);
  switch (ticket.step) {
    case 'cnpj': return '🛠️ *InforBot | Abertura de Chamados — TESTE*\n\nInforme o *CNPJ da empresa* (14 números). Nenhum chamado será aberto no SAC.' + footer;
    case 'confirmCnpj': return `CNPJ encontrado na *base de teste*: ${data.cnpj}\n\n1 — Confirmar CNPJ\n2 — Corrigir CNPJ` + footer;
    case 'requester': return 'Informe seu *nome completo*.' + footer;
    case 'phone': return 'Informe seu *telefone com DDD*, preferencialmente um número com WhatsApp.' + footer;
    case 'email': return 'Informe seu *e-mail*.' + footer;
    case 'description': return 'Descreva detalhadamente o *problema*. Números fazem parte do texto; 0 e cancelar são comandos de cancelamento.' + footer;
    case 'equipment': return 'Selecione o *equipamento/software* da base de teste:\n\n' + (company?.equipment ?? []).map((item, i) => `${i + 1} — ${item.name} | ${item.serial}`).join('\n') + footer;
    case 'address': return 'Selecione o *endereço* da base de teste:\n\n' + (company?.addresses ?? []).map((item, i) => `${i + 1} — ${item.address}`).join('\n') + footer;
    case 'edit': return 'Qual informação deseja corrigir?\n\n' + labels.map((label, i) => `${i + 1} — ${label}`).join('\n') + '\n8 — Voltar ao resumo' + footer;
    case 'review': return `📋 *Resumo do chamado — TESTE*\n\nCNPJ: ${data.cnpj}\nSolicitante: ${data.requester}\nTelefone: ${data.phone}\nEndereço: ${data.addressLabel}\nE-mail: ${data.email}\nEquipamento/Software: ${data.equipmentLabel}\nMotivo: ${data.description}\n\n1 — Confirmar e salvar teste\n2 — Corrigir informações` + footer;
  }
}

export function startSacTest(state: BotState, startMessageId: string, catalog: SacTestCatalog): BotReply {
  const ticket: SacTestState = { step: 'cnpj', data: {}, startMessageId };
  return { state: { ...state, sacTest: ticket }, text: sacTestPrompt(ticket, catalog) };
}

/** Valida novamente o payload final, inclusive os vínculos entre empresa e escolhas. */
export function validSacTestSubmission(data: Partial<SacTestData>, catalog: SacTestCatalog): data is SacTestData {
  const company = catalog.find(item => item.id === data.companyId && item.cnpj === data.cnpj);
  return Boolean(company && data.cnpj && validSacTestCnpj(data.cnpj)
    && company.equipment.some(item => item.id === data.equipmentId && `${item.name} | ${item.serial}` === data.equipmentLabel)
    && company.addresses.some(item => item.id === data.addressId && item.address === data.addressLabel)
    && data.requester?.trim() && data.description?.trim() && data.phone && validSacTestPhone(data.phone)
    && data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    && Object.values(data).every(value => typeof value === 'string' && value.length <= 8000));
}

export function advanceSacTest(state: BotState, input: string, catalog: SacTestCatalog, inputType = 'TEXT'): BotReply {
  // Copiamos o estado para não modificar o snapshot anterior da sessão/simulação.
  const ticket = structuredClone(state.sacTest!);
  const next = { ...state, sacTest: ticket };
  const reply = (error = ''): BotReply => ({ state: next, text: (error ? error + '\n\n' : '') + sacTestPrompt(ticket, catalog) });
  const text = input.trim();
  if (inputType !== 'TEXT') return reply('Nesta versão, envie uma resposta em texto. Anexos ainda não são aceitos.');
  if (ticket.cancelPending) {
    if (text === '2') { delete ticket.cancelPending; return reply('✅ Vamos continuar de onde paramos!'); }
    if (text !== '1') return reply('Opção inválida. Digite 1 para cancelar ou 2 para continuar.');
    const { sacTest: discarded, ...clean } = state;
    return { state: { ...clean, stack: [] }, text: '❌ *Abertura de chamado cancelada.*\n\nOs dados do preenchimento foram descartados. Nenhum chamado foi aberto no SAC.\n\n0 — Voltar ao menu principal' };
  }
  if (text === '0' || text.toLocaleLowerCase('pt-BR') === 'cancelar') { ticket.cancelPending = true; return reply(); }
  if (/^abrir chamado$/i.test(text)) return reply('Você já está preenchendo um chamado. Continue abaixo ou digite cancelar.');
  if (!text || text.length > 8000) return reply('Informe uma resposta de 1 a 8000 caracteres.');
  const finishField = (nextStep: Step) => { ticket.step = ticket.editing ? 'review' : nextStep; delete ticket.editing; };
  const company = catalog.find(item => item.id === ticket.data.companyId);
  switch (ticket.step) {
    case 'cnpj': {
      if (!validSacTestCnpj(text)) return reply('CNPJ inválido. Confira os 14 números e os dígitos verificadores.');
      const found = catalog.find(item => item.cnpj === text.replace(/\D/g, ''));
      if (!found) return reply('CNPJ não encontrado na base de teste. Para testar, use 05.540.238/0001-23.');
      // Trocar a empresa invalida as escolhas dependentes; hoje há um cadastro de teste.
      if (ticket.data.companyId && ticket.data.companyId !== found.id) {
        ticket.data = { companyId: found.id, cnpj: found.cnpj };
        delete ticket.editing;
      } else Object.assign(ticket.data, { companyId: found.id, cnpj: found.cnpj });
      ticket.step = 'confirmCnpj';
      return reply();
    }
    case 'confirmCnpj':
      if (text === '2') { ticket.step = 'cnpj'; return reply(); }
      if (text !== '1') return reply('Escolha 1 para confirmar ou 2 para corrigir.');
      finishField('requester'); return reply();
    case 'requester': ticket.data.requester = text; finishField('phone'); return reply();
    case 'phone':
      if (!validSacTestPhone(text)) return reply('Telefone inválido. Informe DDD e telefone brasileiro, por exemplo 27999999999.');
      ticket.data.phone = text; finishField('address'); return reply();
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return reply('E-mail inválido. Exemplo: nome@empresa.com.br.');
      ticket.data.email = text; finishField('equipment'); return reply();
    case 'description': ticket.data.description = text; finishField('review'); return reply();
    case 'equipment': {
      const selected = /^[1-9]\d*$/.test(text) ? company?.equipment[Number(text) - 1] : undefined;
      if (!selected) return reply('Selecione um equipamento pelo número apresentado.');
      ticket.data.equipmentId = selected.id;
      ticket.data.equipmentLabel = `${selected.name} | ${selected.serial}`;
      finishField('description'); return reply();
    }
    case 'address': {
      const selected = /^[1-9]\d*$/.test(text) ? company?.addresses[Number(text) - 1] : undefined;
      if (!selected) return reply('Selecione um endereço pelo número apresentado.');
      ticket.data.addressId = selected.id; ticket.data.addressLabel = selected.address;
      finishField('email'); return reply();
    }
    case 'edit': {
      if (text === '8') { ticket.step = 'review'; return reply(); }
      const field = /^[1-7]$/.test(text) ? fields[Number(text) - 1] : undefined;
      if (!field) return reply('Escolha um dos campos de 1 a 7, ou 8 para voltar ao resumo.');
      ticket.step = field; ticket.editing = true; return reply();
    }
    case 'review':
      if (text === '2') { ticket.step = 'edit'; return reply(); }
      if (text !== '1') return reply('Escolha 1 para confirmar ou 2 para corrigir.');
      if (!validSacTestSubmission(ticket.data, catalog)) return reply('Não foi possível validar os dados. Escolha 2 para corrigir ou cancele para reiniciar.');
      const { sacTest: completed, ...clean } = state;
      return {
        state: { ...clean, stack: [] },
        text: '✅ *Informações recebidas!*\n\nO preenchimento foi concluído e o registro de teste foi salvo no CotrimBot.\n\n*Este atendimento está em modo de teste. Nenhum chamado foi aberto no SAC.*\n\n0 — Voltar ao menu principal',
        sacTestSubmission: { startMessageId: ticket.startMessageId, data: ticket.data },
      };
  }
}
