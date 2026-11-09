import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { prisma } from "../lib/prisma.js";
import type { OrganizationWebhookEvent } from "./organization-webhook-events.js";

export type WebhookDatabase = Pick<typeof prisma, "organizationWebhook" | "organizationWebhookDelivery">;

export type DeliveryOptions = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  // Intervalos entre tentativas; o total de tentativas é o tamanho do array + 1.
  retryDelaysMs?: number[];
  timeoutMs?: number;
};

const DEFAULT_RETRY_DELAYS_MS = [2_000, 8_000];
const DEFAULT_TIMEOUT_MS = 10_000;

export function generateWebhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

// Assinatura sobre "<timestamp>.<body>" para que o receptor valide também a frescura da entrega.
export function signWebhookPayload(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function normalizeWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    if (url.protocol === "https:") return url.toString();
    // HTTP simples só fora de produção, para ambientes de teste locais.
    if (url.protocol === "http:" && process.env.NODE_ENV !== "production") return url.toString();
    return null;
  } catch {
    return null;
  }
}

function describeFailure(error: unknown) {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  const code = typeof cause === "string" ? cause : (error as { name?: unknown } | null)?.name;
  return `Falha de conexão${typeof code === "string" ? `: ${code}` : ""}`.slice(0, 255);
}

// Entrega um evento ao endpoint e registra o resultado. Nunca lança erro.
export async function deliverOrganizationWebhook(
  database: WebhookDatabase,
  webhook: { id: string; url: string; secret: string },
  event: OrganizationWebhookEvent,
  organizationId: string,
  data: Record<string, unknown>,
  options: DeliveryOptions = {},
): Promise<"SUCCEEDED" | "FAILED"> {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const deliveryId = randomUUID();
  const body = JSON.stringify({ id: deliveryId, event, organizationId, createdAt: new Date().toISOString(), data });

  let status: "SUCCEEDED" | "FAILED" = "FAILED";
  let attempts = 0;
  let responseStatus: number | null = null;
  let error: string | null = null;

  for (let index = 0; index <= retryDelays.length; index += 1) {
    attempts = index + 1;
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const response = await fetchImpl(webhook.url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CotrimBot-Webhooks/1",
          "X-CotrimBot-Event": event,
          "X-CotrimBot-Delivery": deliveryId,
          "X-CotrimBot-Timestamp": timestamp,
          "X-CotrimBot-Signature": signWebhookPayload(webhook.secret, timestamp, body),
        },
        body,
      });
      responseStatus = response.status;
      await response.body?.cancel().catch(() => undefined);
      console.log(`[webhooks] ${event} webhook=${webhook.id} tentativa=${attempts} HTTP ${response.status}`);
      if (response.ok) {
        status = "SUCCEEDED";
        error = null;
        break;
      }
      error = `HTTP ${response.status}`;
    } catch (failure) {
      responseStatus = null;
      error = describeFailure(failure);
      console.log(`[webhooks] ${event} webhook=${webhook.id} tentativa=${attempts} ${error}`);
    }
    if (index < retryDelays.length) await sleep(retryDelays[index]!);
  }

  try {
    await database.organizationWebhookDelivery.create({
      data: { id: deliveryId, webhookId: webhook.id, event, status, attempts, responseStatus, error },
    });
  } catch {
    console.error("Falha ao registrar entrega de webhook.");
  }
  console.log(`[webhooks] ${event} webhook=${webhook.id} entrega ${deliveryId} ${status} apos ${attempts} tentativa(s)`);
  return status;
}

// Envia o evento a todos os webhooks ativos da empresa que assinam esse evento.
export async function dispatchOrganizationWebhookEvent(
  database: WebhookDatabase,
  organizationId: string,
  event: OrganizationWebhookEvent,
  data: Record<string, unknown>,
  options?: DeliveryOptions,
): Promise<number> {
  const webhooks = await database.organizationWebhook.findMany({
    where: { organizationId, active: true },
    select: { id: true, url: true, secret: true, events: true },
  });
  const subscribed = webhooks.filter((webhook) => Array.isArray(webhook.events) && webhook.events.includes(event));
  console.log(`[webhooks] evento ${event} org=${organizationId}: ${webhooks.length} ativo(s), ${subscribed.length} assinando`);
  await Promise.all(subscribed.map((webhook) => deliverOrganizationWebhook(database, webhook, event, organizationId, data, options)));
  return subscribed.length;
}

// Ponto de entrada usado pelas rotas após gravar a alteração. Não bloqueia a resposta HTTP.
export function emitOrganizationWebhookEvent(
  database: WebhookDatabase,
  organizationId: string | null | undefined,
  event: OrganizationWebhookEvent,
  data: Record<string, unknown>,
) {
  if (!organizationId) {
    console.log(`[webhooks] evento ${event} ignorado: sem organizationId`);
    return;
  }
  dispatchOrganizationWebhookEvent(database, organizationId, event, data).catch((failure) => {
    console.error(`[webhooks] falha ao disparar ${event} org=${organizationId}:`, failure);
  });
}
