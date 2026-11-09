// Catálogo de eventos que uma empresa pode assinar em seus webhooks de saída.
// Cada chave é estável (faz parte do contrato com o integrador): não renomear após publicar.
export const ORGANIZATION_WEBHOOK_EVENTS = [
  {
    key: "internal_conversation.created",
    group: "Chat interno",
    label: "Conversa interna criada",
    description: "Uma conversa individual ou em grupo foi criada entre membros da empresa.",
  },
  {
    key: "internal_message.created",
    group: "Chat interno",
    label: "Mensagem interna enviada",
    description: "Uma mensagem não privada foi enviada em uma conversa interna.",
  },
  {
    key: "client.created",
    group: "Clientes",
    label: "Cliente criado",
    description: "Um perfil de cliente da empresa foi cadastrado.",
  },
  {
    key: "client.updated",
    group: "Clientes",
    label: "Cliente atualizado",
    description: "Um perfil de cliente da empresa foi alterado.",
  },
  {
    key: "client.deleted",
    group: "Clientes",
    label: "Cliente removido",
    description: "Um perfil de cliente da empresa foi excluído.",
  },
  {
    key: "bot.published",
    group: "Bots",
    label: "Bot publicado",
    description: "Uma nova revisão de um bot da empresa foi publicada.",
  },
  {
    key: "bot.activation_changed",
    group: "Bots",
    label: "Ativação de bot alterada",
    description: "Um bot da empresa foi ativado ou desativado.",
  },
  {
    key: "poll.created",
    group: "Enquetes",
    label: "Enquete enviada",
    description: "Uma enquete foi enviada pelo CotrimBot em nome da empresa.",
  },
  {
    key: "poll.vote_changed",
    group: "Enquetes",
    label: "Voto em enquete registrado",
    description: "Um ou mais votos de uma enquete enviada pela empresa foram registrados ou alterados.",
  },
  {
    key: "poll.closed",
    group: "Enquetes",
    label: "Enquete encerrada",
    description: "Uma enquete enviada pela empresa foi encerrada no CotrimBot.",
  },
] as const;

export type OrganizationWebhookEvent = (typeof ORGANIZATION_WEBHOOK_EVENTS)[number]["key"];

const EVENT_KEYS = new Set<string>(ORGANIZATION_WEBHOOK_EVENTS.map((event) => event.key));

export function isOrganizationWebhookEvent(value: unknown): value is OrganizationWebhookEvent {
  return typeof value === "string" && EVENT_KEYS.has(value);
}

// Aceita somente um array não vazio de chaves conhecidas, sem repetições.
export function normalizeWebhookEvents(value: unknown): OrganizationWebhookEvent[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > ORGANIZATION_WEBHOOK_EVENTS.length) return null;
  const unique = [...new Set(value)];
  if (unique.length !== value.length || !unique.every(isOrganizationWebhookEvent)) return null;
  return unique as OrganizationWebhookEvent[];
}
