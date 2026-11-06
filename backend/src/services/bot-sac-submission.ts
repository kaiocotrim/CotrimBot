import type { prisma } from '../lib/prisma.js';
import { SacApiError, type JsonValue, type TicketCreateInput } from '../lib/sac/index.js';
import { createSacClient } from './bot-sac.service.js';
import type { SacTestState } from './bot-sac-test.js';

export function sacTicketPayload(ticket: SacTestState): TicketCreateInput {
  const data = ticket.data;
  const equipment = ticket.catalog?.find(item => item.id === data.companyId)?.equipment.find(item => item.id === data.equipmentId);
  if (!ticket.real || ticket.source !== 'sac' || !data.companyId || !equipment || !/^\d+$/.test(equipment.id)
    || !Number.isSafeInteger(Number(equipment.id)) || Number(equipment.id) <= 0 || !data.requester || !data.description
    || !data.department || !data.phone || !data.addressLabel || !data.email) throw new Error('Dados incompletos para abrir chamado.');
  return { IdTenant: data.companyId, IdEstoque: Number(equipment.id), Solicitante: data.requester,
    Motivo: data.description, Departamento: data.department, Telefone: data.phone, Endereco: data.addressLabel,
    Email: data.email, Maquina: equipment.name, Origem: 'WhatsApp' };
}

export function sacProtocol(value: JsonValue): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (Array.isArray(value)) return value.length === 1 ? sacProtocol(value[0]!) : null;
  if (value && typeof value === 'object') {
    for (const key of ['Protocolo', 'IdChamado', 'idChamado', 'protocolo', 'protocol']) {
      const protocol = value[key];
      if ((typeof protocol === 'string' && protocol.trim() && protocol.length <= 191)
        || (typeof protocol === 'number' && Number.isSafeInteger(protocol) && protocol > 0)) return String(protocol);
    }
    if (value.data) return sacProtocol(value.data);
  }
  return null;
}

type SubmissionContext = { botId: string; contactId: number; organizationId: string };
type SubmissionResult = { status: 'SUCCEEDED' | 'REJECTED' | 'UNCERTAIN'; protocol?: string };

export async function submitSacTicket(database: Pick<typeof prisma, 'botSacSubmission'>, ticket: SacTestState,
  context: SubmissionContext, create = (input: TicketCreateInput) => createSacClient().tickets.create(input)): Promise<SubmissionResult> {
  const input = sacTicketPayload(ticket);
  const startMessageId = Number(ticket.startMessageId);
  if (!Number.isSafeInteger(startMessageId) || startMessageId <= 0) throw new Error('Identificador da coleta inválido.');
  const previous = await database.botSacSubmission.findUnique({ where: { startMessageId } });
  if (previous) {
    if (previous.botId !== context.botId || previous.contactId !== context.contactId || previous.organizationId !== context.organizationId) throw new Error('Coleta pertence a outro atendimento.');
    return previous.status === 'SUCCEEDED' && previous.protocol ? { status: 'SUCCEEDED', protocol: previous.protocol }
      : { status: previous.status === 'REJECTED' ? 'REJECTED' : 'UNCERTAIN' };
  }
  try {
    await database.botSacSubmission.create({ data: { startMessageId, ...context, status: 'PENDING' } });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return { status: 'UNCERTAIN' };
    throw error;
  }
  // The committed claim survives process crashes, send failures and session rollbacks.
  // Without upstream idempotency, ambiguous POSTs must never be retried automatically.
  let result: SubmissionResult;
  try {
    const protocol = sacProtocol(await create(input));
    result = protocol ? { status: 'SUCCEEDED', protocol } : { status: 'UNCERTAIN' };
  } catch (error) {
    // Keep the upstream reason available to operators without logging the request,
    // credentials or the customer's collected data.
    let reason = error instanceof SacApiError ? error.message : 'Falha de conexão ou resposta inválida do SAC.';
    const secrets = [process.env.SAC_API_TOKEN, process.env.SAC_TOKEN,
      ...Object.entries(input).filter(([key]) => key !== 'Origem').map(([, value]) => String(value ?? ''))]
      .filter((value): value is string => typeof value === 'string' && value.length >= 3).sort((a, b) => b.length - a.length);
    for (const value of secrets) reason = reason.replaceAll(value, '[omitido]');
    reason = reason.replace(/Bearer\s+\S+/gi, 'Bearer [omitido]').slice(0, 1000);
    console.error('Falha ao abrir chamado no SAC.', {
      startMessageId,
      status: error instanceof SacApiError ? error.status : null,
      reason,
    });
    result = { status: error instanceof SacApiError && [400, 401, 403, 404, 422].includes(error.status) ? 'REJECTED' : 'UNCERTAIN' };
  }
  await database.botSacSubmission.update({ where: { startMessageId }, data: { status: result.status, protocol: result.protocol ?? null } });
  return result;
}
