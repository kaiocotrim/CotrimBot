// Service worker do CotrimBot: cache básico para uso offline e notificações push.
// Ao alterar a lista de arquivos ou a estratégia de cache, incremente a versão.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `cotrimbot-static-${CACHE_VERSION}`;
const PAGES_CACHE = `cotrimbot-pages-${CACHE_VERSION}`;

// Casca mínima do app, disponível mesmo sem rede.
const PRECACHE_URLS = [
  "/",
  "/login/",
  "/manifest.json",
  "/Logo-CotrimBot-nova.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/badge-96x96.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      // Um arquivo indisponível não deve impedir a instalação do service worker.
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("cotrimbot-") && key !== STATIC_CACHE && key !== PAGES_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// API, autenticação e WebSocket sempre vão direto para a rede.
function isBypassed(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/");
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true })
      ?? await caches.match(request, { ignoreSearch: true })
      ?? await caches.match("/");
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isBypassed(url)) return;

  // Páginas: tenta a rede e usa o cache quando estiver offline.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Arquivos do build do Next têm hash no nome e nunca mudam.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (["image", "font", "style", "script", "manifest"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Recebe a notificação enviada pelo backend (web-push) e exibe no sistema operacional.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "CotrimBot";
  const data = {
    id: typeof payload.id === "number" ? payload.id : null,
    type: payload.type ?? null,
    contactId: typeof payload.contactId === "number" ? payload.contactId : null,
    internalConversationId: typeof payload.internalConversationId === "string" ? payload.internalConversationId : null,
  };

  event.waitUntil((async () => {
    // Com o app em foco, o socket já exibe a notificação in-app; evita duplicar o aviso.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some((client) => client.focused)) return;

    await self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-96x96.png",
      // Mesma tag usada pelas notificações do navegador em use-notifications.ts.
      tag: data.id ? `cotrimbot-${data.id}` : undefined,
      data,
    });
  })());
});

// Ao clicar, foca uma janela do app (ou abre uma nova) e abre a conversa.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { id, contactId, internalConversationId } = event.notification.data ?? {};

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin);

    if (client) {
      client.postMessage({ type: "cotrimbot:notification-click", notificationId: id ?? null, contactId: contactId ?? null, internalConversationId: internalConversationId ?? null });
      await client.focus().catch(() => undefined);
      return;
    }

    const params = new URLSearchParams();
    if (contactId) params.set("contactId", String(contactId));
    if (internalConversationId) params.set("conversationId", String(internalConversationId));
    if (id) params.set("notificationId", String(id));
    const query = params.toString();
    await self.clients.openWindow(`${internalConversationId ? "/chat-interno/" : "/"}${query ? `?${query}` : ""}`);
  })());
});
