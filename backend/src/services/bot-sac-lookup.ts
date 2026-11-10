import type { BotFlow, BotReply, BotState } from './bot-flow.js';
import type { Ticket } from '../lib/sac/index.js';
import { createSacClient } from './bot-sac.service.js';
import { validSacTestCnpj } from './bot-sac-test-validation.js';

export type SacLookupRouting = {
  fallbackUserId?: string;
  technicians: { name: string; userId: string; available: boolean }[];
};
export type SacLookupState = {
  step: 'protocol' | 'cnpj' | 'transfer' | 'notFound'; protocol?: string; cnpj?: string;
};
const footer = '\n\n0 — Cancelar consulta';
export function startSacLookup(state: BotState): BotReply {
  return { state: { ...state, sacLookup: { step: 'protocol' } }, text: '🔎 *Consultar chamado*\n\nInforme o número do chamado.' + footer };
}

/** Lists are scoped by tenant. A missing row is not proof that an old ticket does not exist. */
export async function findSacTicket(cnpj: string, protocol: string, sac = createSacClient()): Promise<Ticket | null> {
  if (!validSacTestCnpj(cnpj) || !/^[1-9]\d{0,14}$/.test(protocol) || !Number.isSafeInteger(Number(protocol))) return null;
  const checks = await sac.tenants.checkByCnpj(cnpj.replace(/\D/g, ''));
  const ids = [...new Set(checks.filter(t => t.valido === true && typeof t.IdTenant === 'string' && t.IdTenant.trim()).map(t => t.IdTenant!))];
  if (ids.length !== 1) return null;
  const rows = await sac.tickets.list(ids[0]!);
  const matches = rows.filter(t => String(t.IdChamado) === protocol);
  return matches.length === 1 ? matches[0]! : null;
}

function samePhone(contactPhone: string | undefined, ticketPhone: string | null): boolean {
  const normalize = (v: string) => v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const a = normalize(contactPhone ?? '');
  // Do not treat a suffix or a phone buried in free text as ownership evidence.
  return /^\d{10,11}$/.test(a) && !!ticketPhone && a === normalize(ticketPhone);
}
export function sacTechnicianTarget(flow: BotFlow, technician: string | null): string | undefined {
  const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = flow.sacLookup?.technicians.filter(t => normalize(t.name) === normalize(technician ?? '')) ?? [];
  return matches.length === 1 && matches[0]!.available && matches[0]!.userId !== flow.assignedUserId
    ? matches[0]!.userId : flow.sacLookup?.fallbackUserId || undefined;
}

export async function advanceSacLookup(flow: BotFlow, state: BotState, input: string, context: {
  phone?: string; inputType?: string;
  findTicket?: typeof findSacTicket;
  resolveTarget?: (userId: string | undefined) => Promise<string | undefined>;
} = {}): Promise<BotReply> {
  const next = structuredClone(state);
  const lookup = next.sacLookup!;
  const text = input.trim();
  const reply = (message: string): BotReply => ({ state: next, text: message + footer });
  if (context.inputType && context.inputType !== 'TEXT') return reply('Envie sua resposta em texto.');
  if (/^(0|cancelar)$/i.test(text)) {
    delete next.sacLookup;
    next.menuId = flow.rootMenuId; next.stack = [];
    return { state: next, text: 'Consulta cancelada.\n\n0 — Menu principal' };
  }
  if (lookup.step === 'protocol') {
    if (!/^[1-9]\d{0,14}$/.test(text) || !Number.isSafeInteger(Number(text))) return reply('Informe somente um número de chamado válido.');
    lookup.protocol = text; lookup.step = 'cnpj';
    return reply('Informe o CNPJ da empresa vinculada ao chamado.');
  }
  if (lookup.step === 'cnpj' && !validSacTestCnpj(text)) return reply('CNPJ inválido. Confira o número informado.');
  if (['transfer', 'notFound'].includes(lookup.step) && !['1', '2'].includes(text)) return reply('1 — Solicitar atendimento\n2 — Consultar outro chamado');
  if (['transfer', 'notFound'].includes(lookup.step) && text === '2') return startSacLookup(next);
  if (lookup.step === 'notFound') {
    let target = flow.sacLookup?.fallbackUserId || undefined;
    if (context.resolveTarget) target = await context.resolveTarget(target);
    delete next.sacLookup; next.status = 'WAITING_HUMAN';
    return { state: next, text: 'Sua conversa foi encaminhada para o suporte conferir o chamado informado.', handoff: {
      ...(target ? { userId: target } : {}), note: `Consulta SAC: protocolo informado ${lookup.protocol}. CNPJ informado: ${lookup.cnpj}. Não localizado na listagem disponível; conferir existência e autorização do contato antes de compartilhar dados.`,
    } };
  }
  const cnpj = lookup.step === 'cnpj' ? text.replace(/\D/g, '') : lookup.cnpj!;
  let ticket: Ticket | null;
  try { ticket = await (context.findTicket ?? findSacTicket)(cnpj, lookup.protocol!); }
  catch { return reply('Não foi possível consultar o SAC. Tente novamente ou cancele a consulta.'); }
  if (!ticket) {
    lookup.step = 'notFound'; lookup.cnpj = cnpj;
    return reply('Não localizei esse chamado na consulta disponível para o CNPJ. Confira os dados. Chamados antigos podem precisar de consulta pela equipe.\n\n1 — Pedir ajuda ao suporte\n2 — Consultar outro chamado');
  }
  if (lookup.step === 'cnpj') {
    lookup.cnpj = cnpj; lookup.step = 'transfer';
    const summary = samePhone(context.phone, ticket.FoneContato)
      ? `📋 *Chamado ${ticket.IdChamado}*\nSituação: ${ticket.StatusChamado || 'Não informada'}\nEquipamento: ${ticket.Equipamento || 'Não informado'}\nSérie: ${ticket.NrSerie || 'Não informada'}\nTécnico: ${ticket.Tecnico || 'Ainda não atribuído'}`
      : 'Para proteger os dados do chamado, a equipe precisará confirmar sua autorização neste número de contato.';
    const target = sacTechnicianTarget(flow, ticket.Tecnico);
    return reply(summary + '\n\n' + (target && target !== flow.sacLookup?.fallbackUserId
      ? 'Deseja falar com o técnico responsável?' : 'Deseja encaminhar a conversa para o suporte?') + '\n\n1 — Sim, solicitar atendimento\n2 — Consultar outro chamado');
  }
  // Re-read the ticket on confirmation: its technician may have changed meanwhile.
  let target = sacTechnicianTarget(flow, ticket.Tecnico);
  if (context.resolveTarget) target = await context.resolveTarget(target);
  delete next.sacLookup;
  next.status = 'WAITING_HUMAN';
  return { state: next, text: target ? 'Vou encaminhar sua conversa para o atendimento responsável.' : 'Sua conversa foi encaminhada para a fila de suporte. Aguarde o atendimento da equipe.',
    handoff: { ...(target ? { userId: target } : {}), note: `Consulta SAC: chamado ${lookup.protocol}. CNPJ informado: ${cnpj}. Técnico no SAC: ${ticket.Tecnico || 'Não atribuído'}. ${samePhone(context.phone, ticket.FoneContato) ? 'Telefone coincide com o registrado no chamado.' : 'Contato por outro número: confirmar autorização antes de compartilhar dados.'}` } };
}
