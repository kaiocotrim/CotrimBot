const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type WebhookEventDefinition = {
  key: string;
  group: string;
  label: string;
  description: string;
};

export type OrganizationWebhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDelivery = {
  id: string;
  event: string;
  status: "SUCCEEDED" | "FAILED" | string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
};

export type WebhookInput = {
  name: string;
  url: string;
  events: string[];
  active: boolean;
};

async function request<T>(organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Organization-Id": organizationId },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Não foi possível concluir a operação.");
  return payload as T;
}

export async function listOrganizationWebhookEvents(organizationId: string): Promise<WebhookEventDefinition[]> {
  const payload = await request<{ events: WebhookEventDefinition[] }>(organizationId, "/organization-webhooks/events");
  return payload.events;
}

export async function listOrganizationWebhooks(organizationId: string): Promise<OrganizationWebhook[]> {
  const payload = await request<{ webhooks: OrganizationWebhook[] }>(organizationId, "/organization-webhooks");
  return payload.webhooks;
}

export function createOrganizationWebhook(organizationId: string, input: WebhookInput) {
  return request<{ webhook: OrganizationWebhook; secret: string }>(organizationId, "/organization-webhooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOrganizationWebhook(organizationId: string, id: string, input: Partial<WebhookInput>): Promise<OrganizationWebhook> {
  const payload = await request<{ webhook: OrganizationWebhook }>(organizationId, `/organization-webhooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return payload.webhook;
}

export function rotateOrganizationWebhookSecret(organizationId: string, id: string) {
  return request<{ webhook: OrganizationWebhook; secret: string }>(organizationId, `/organization-webhooks/${encodeURIComponent(id)}/rotate-secret`, {
    method: "POST",
  });
}

export function deleteOrganizationWebhook(organizationId: string, id: string) {
  return request<void>(organizationId, `/organization-webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listOrganizationWebhookDeliveries(organizationId: string, id: string): Promise<WebhookDelivery[]> {
  const payload = await request<{ deliveries: WebhookDelivery[] }>(organizationId, `/organization-webhooks/${encodeURIComponent(id)}/deliveries`);
  return payload.deliveries;
}
