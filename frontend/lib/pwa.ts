import { unsubscribeFromPush } from "@/lib/push-api";

// Em desenvolvimento o service worker atrapalharia o recarregamento do Next com o cache.
export const PWA_ENABLED = process.env.NODE_ENV === "production";

export function isServiceWorkerSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export function isPushSupported() {
  return PWA_ENABLED && isServiceWorkerSupported() && "PushManager" in window && "Notification" in window;
}

export function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// Garante o service worker registrado e ativo antes de usar o PushManager.
export async function getServiceWorkerRegistration() {
  if (!(await navigator.serviceWorker.getRegistration())) await registerServiceWorker();
  return navigator.serviceWorker.ready;
}

// Converte a chave VAPID (base64url) para o formato esperado pelo PushManager.
export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

// Usado ao sair da conta: este dispositivo deixa de receber push do usuário atual.
export async function removePushSubscription() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await unsubscribeFromPush(subscription.endpoint).catch((error) => console.error(error));
  await subscription.unsubscribe();
}
