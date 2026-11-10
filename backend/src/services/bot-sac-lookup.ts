import type { BotFlow, BotReply, BotState } from './bot-flow.js';
import { advanceBot } from './bot-flow.js';
import type { Ticket } from '../lib/sac/index.js';
import { createSacClient } from './bot-sac.service.js';

export type SacLookupRouting = {
  fallbackUserId?: string;
  technicians: { name: string; userId: string; available: boolean }[];
};
export type SacLookupState = {
  step: 'protocol' | 'cnpj' | 'transfer' | 'notFound' | 'completed'; protocol?: string; cnpj?: string;
};
export type SacRoutingMember = { userId: string; displayName?: string | null; user: { name: string; banned?: boolean | null } };
const normalizeTechnician = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
const footer = '\n\n↩️ *0 — Voltar ao menu principal*';
export function startSacLookup(state: BotState): BotReply {
  return { state: { ...state, sacLookup: { step: 'protocol' } }, text: '🔎 *InforBot | Consultar Chamado*\n\nVamos verificar o andamento da sua solicitação!\n\n🎫 Por favor, informe o *número do chamado* que deseja consultar.\n\nAssim, poderemos localizar sua solicitação e apresentar as informações disponíveis.' + footer };
}

/** Search only tenants accessible to the integration. Never use an unfiltered ticket list. */
export async function findSacTicket(protocol: string, client?: ReturnType<typeof createSacClient>): Promise<Ticket | null> {
  if (!/^[1-9]\d{0,14}$/.test(protocol) || !Number.isSafeInteger(Number(protocol))) return null;
  // The SDK currently has no documented direct lookup by protocol. Infordoc's
  // aggregate view is the quickest path for recent calls; fall back to client
  // tenant lists when the protocol is absent from that view's limited response.
  const sac = client ?? createSacClient(process.env, AbortSignal.timeout(15000));
  const tenants = await sac.tenants.list();
  const ordered = [...tenants].sort((a, b) => Number(b.tenantName?.trim().toLowerCase() === 'infordoc') - Number(a.tenantName?.trim().toLowerCase() === 'infordoc'));
  const ids = [...new Set(ordered.filter(t => typeof t.IdTenant === 'string' && t.IdTenant.trim()).map(t => t.IdTenant.trim()))];
  const read = async (id: string) => {
    const rows = await sac.tickets.list(id);
    const found = rows.filter(t => String(t.IdChamado) === protocol);
    if (new Set(found.map(t => JSON.stringify([t.StatusChamado, t.Tecnico]))).size > 1) throw new Error('Respostas divergentes para o protocolo SAC.');
    return found;
  };
  const first = ids.shift();
  if (!first) return null;
  const initial = await read(first);
  if (initial.length) return initial[0]!;
  const matches: Ticket[] = [];
  let cursor = 0;
  const searches = await Promise.allSettled(Array.from({ length: Math.min(6, ids.length) }, async () => {
    while (!matches.length && cursor < ids.length) {
      const id = ids[cursor++]!;
      matches.push(...await read(id));
    }
  }));
  // Infordoc's aggregate view can repeat a ticket from a client tenant. Accept
  // duplicates only when the displayed status and responsible person agree.
  if (new Set(matches.map(t => JSON.stringify([t.StatusChamado, t.Tecnico]))).size > 1) throw new Error('Respostas divergentes para o protocolo SAC.');
  if (searches.some(r => r.status === 'rejected')) throw new Error('Não foi possível concluir a busca do protocolo SAC.');
  return matches[0] ?? null;
}

function samePhone(contactPhone: string | undefined, ticketPhone: string | null): boolean {
  const normalize = (v: string) => v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const a = normalize(contactPhone ?? '');
  // Do not treat a suffix or a phone buried in free text as ownership evidence.
  return /^\d{10,11}$/.test(a) && !!ticketPhone && a === normalize(ticketPhone);
}
function configuredTechnicians(flow: BotFlow, technician: string | null | undefined) {
  const name = normalizeTechnician(technician ?? '');
  const entries = flow.sacLookup?.technicians ?? [];
  const exact = entries.filter(t => normalizeTechnician(t.name) === name);
  if (exact.length) return exact;
  // A configured first name is an explicit alias for the SAC's full name.
  // Full-name bindings take precedence; never use substrings or fuzzy matching.
  const firstName = name.split(' ')[0];
  return firstName ? entries.filter(t => normalizeTechnician(t.name) === firstName) : [];
}
export function sacTechnicianTarget(flow: BotFlow, technician: string | null): string | undefined {
  const matches = configuredTechnicians(flow, technician);
  return matches.length === 1 && matches[0]!.available && matches[0]!.userId !== flow.assignedUserId
    ? matches[0]!.userId : flow.sacLookup?.fallbackUserId || undefined;
}

/** Members must already be restricted to the bot's organization by the caller. */
export function resolveSacTechnicianTarget(flow: BotFlow, technician: string | null | undefined, members: readonly SacRoutingMember[], botUserId = flow.assignedUserId): string | undefined {
  const eligible = members.filter(m => m.userId !== botUserId && m.user.banned !== true);
  const fallback = eligible.find(m => m.userId === flow.sacLookup?.fallbackUserId)?.userId;
  const name = normalizeTechnician(technician ?? '');
  if (!name) return fallback;
  const configured = configuredTechnicians(flow, technician);
  // The administrator explicitly selects the CotrimBot member for each SAC
  // technician. Do not infer destinations from names or override availability.
  if (configured.length) return configured.length === 1 && configured[0]!.available
    ? eligible.find(m => m.userId === configured[0]!.userId)?.userId ?? fallback : fallback;
  return fallback;
}

export async function advanceSacLookup(flow: BotFlow, state: BotState, input: string, context: {
  phone?: string; inputType?: string;
  findTicket?: typeof findSacTicket;
  resolveTarget?: (userId: string | undefined, technician?: string | null) => Promise<string | { userId: string; name: string } | undefined>;
} = {}): Promise<BotReply> {
  const next = structuredClone(state);
  const lookup = next.sacLookup!;
  const text = input.trim();
  const reply = (message: string): BotReply => ({ state: next, text: message + footer });
  if (context.inputType && context.inputType !== 'TEXT') return reply('Envie sua resposta em texto.');
  if (/^(0|cancelar)$/i.test(text)) {
    delete next.sacLookup;
    next.menuId = flow.rootMenuId; next.stack = [];
    return advanceBot(flow, next, '0');
  }
  // A conversation opened before the protocol-only flow may still be waiting
  // for a CNPJ. Restart that step instead of interpreting a CNPJ as a protocol.
  if (lookup.step === 'cnpj') return startSacLookup(next);
  if (lookup.step === 'completed') return text === '1' ? startSacLookup(next) : reply('1 — 🔎 Consultar outro chamado');
  if (lookup.step === 'protocol') {
    if (!/^[1-9]\d{0,14}$/.test(text) || !Number.isSafeInteger(Number(text))) return reply('Informe somente um número de chamado válido.');
    lookup.protocol = text;
  }
  if (['transfer', 'notFound'].includes(lookup.step) && !['1', '2'].includes(text)) return reply('1 — Solicitar atendimento\n2 — Consultar outro chamado');
  if (['transfer', 'notFound'].includes(lookup.step) && text === '2') return startSacLookup(next);
  if (lookup.step === 'notFound') {
    let target = flow.sacLookup?.fallbackUserId || undefined;
    if (context.resolveTarget) {
      const resolved = await context.resolveTarget(target);
      target = typeof resolved === 'object' ? resolved.userId : resolved;
    }
    delete next.sacLookup; next.status = 'WAITING_HUMAN';
    return { state: next, text: 'Sua conversa foi encaminhada para o suporte conferir o chamado informado.', handoff: {
      ...(target ? { userId: target } : {}), note: `Consulta SAC: protocolo informado ${lookup.protocol}. Não localizado na listagem disponível; conferir existência e autorização do contato antes de compartilhar dados.`,
    } };
  }
  let ticket: Ticket | null;
  try { ticket = await (context.findTicket ?? findSacTicket)(lookup.protocol!); }
  catch { return reply('Não foi possível consultar o SAC. Tente novamente ou cancele a consulta.'); }
  if (!ticket) {
    lookup.step = 'notFound';
    return reply('Não localizei esse chamado na consulta disponível do SAC. Confira o número. Chamados antigos podem precisar de consulta pela equipe.\n\n1 — Pedir ajuda ao suporte\n2 — Consultar outro chamado');
  }
  const rawName = ticket.Tecnico?.trim() || '';
  const name = rawName === rawName.toLocaleUpperCase('pt-BR')
    ? rawName.toLocaleLowerCase('pt-BR').replace(/(^|\s)\p{L}/gu, letter => letter.toLocaleUpperCase('pt-BR')) : rawName;
  // Also check on transfer confirmation: the technician may have completed the
  // ticket after the customer read its original status.
  if (normalizeTechnician(ticket.StatusChamado ?? '') === 'atendido') {
    lookup.step = 'completed';
    return { state: next, text: `🎫 *InforBot | Detalhes do Chamado*\n\n📋 *Chamado nº ${ticket.IdChamado}*\n\n✅ *Status:* Atendido\n👨‍💻 *Responsável:* ${name || 'Não informado'}\n\n✅ Este chamado já foi atendido e consta como finalizado em nosso sistema.\n\n*Deseja consultar outro chamado?*\n\n1 — 🔎 Consultar outro chamado\n0 — ↩️ Voltar ao menu principal\n\n*Digite o número da opção desejada.*` };
  }
  if (lookup.step === 'protocol') {
    lookup.step = 'transfer';
    const rawStatus = ticket.StatusChamado?.trim() || 'Não informado';
    const status = normalizeTechnician(rawStatus) === 'aberto' ? '🟢 Aberto' : rawStatus;
    const summary = `🎫 *InforBot | Detalhes do Chamado*\n\n📋 *Chamado nº ${ticket.IdChamado}*\n\n📌 *Status:* ${status}\n👨‍💻 *Responsável:* ${name || 'Ainda não atribuído'}\n\n${name ? '✅ Seu chamado está registrado em nosso sistema e possui um técnico responsável pelo atendimento.' : '✅ Seu chamado está registrado em nosso sistema e aguarda a atribuição de um técnico responsável.'}\n\n*Como deseja continuar?*\n\n1 — 💬 Solicitar atendimento com o responsável\n2 — 🔎 Consultar outro chamado\n0 — ↩️ Voltar ao menu principal\n\n*Digite o número da opção desejada.*`;
    return { state: next, text: summary };
  }
  // Re-read the ticket on confirmation: its technician may have changed meanwhile.
  let target = sacTechnicianTarget(flow, ticket.Tecnico);
  if (context.resolveTarget) {
    const resolved = await context.resolveTarget(target, ticket.Tecnico);
    target = typeof resolved === 'object' ? resolved.userId : resolved;
  }
  delete next.sacLookup;
  next.status = 'WAITING_HUMAN';
  return { state: next, text: target && target !== flow.sacLookup?.fallbackUserId
    ? '✅ *InforBot | Atendimento Solicitado*\n\n👨‍💻 Sua conversa foi encaminhada com sucesso ao *técnico responsável pelo chamado*.\n\n💬 Aguarde um momento. O responsável dará continuidade ao atendimento assim que estiver disponível.'
    : target ? 'Sua conversa foi encaminhada para o suporte.' : 'Sua conversa foi encaminhada para a fila de suporte. Aguarde o atendimento da equipe.',
    handoff: { ...(target ? { userId: target } : {}), note: `Consulta SAC: chamado ${lookup.protocol}. Técnico no SAC: ${ticket.Tecnico || 'Não atribuído'}. ${samePhone(context.phone, ticket.FoneContato) ? 'Telefone coincide com o registrado no chamado.' : 'Contato por outro número: confirmar autorização antes de compartilhar detalhes adicionais.'}` } };
}
