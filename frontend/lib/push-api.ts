const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error("Não foi possível atualizar as notificações push");
  return response;
}

function postJson(path: string, body: unknown) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Chave pública VAPID usada pelo navegador para criar a assinatura push.
export async function getPushPublicKey() {
  const response = await request("/push/public-key");
  const { publicKey } = (await response.json()) as { publicKey: string };
  return publicKey;
}

export async function subscribeToPush(subscription: PushSubscriptionJSON) {
  await postJson("/push/subscribe", { endpoint: subscription.endpoint, keys: subscription.keys });
}

export async function unsubscribeFromPush(endpoint: string) {
  await postJson("/push/unsubscribe", { endpoint });
}
