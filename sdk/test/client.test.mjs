import assert from "node:assert/strict";
import { test } from "node:test";
import { CotrimBotApiError, CotrimBotClient } from "../dist/index.js";

function mockedClient(responses = []) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    const response = responses.shift();
    return response ?? Response.json({});
  };
  return { client: new CotrimBotClient({ baseUrl: "https://api.example.test", fetch, headers: { "X-Api-Key": "test" } }), requests };
}

test("usa /api, cookies e headers padrão nos namespaces", async () => {
  const { client, requests } = mockedClient();
  await client.contacts.list({ limit: 10, archived: false });
  assert.equal(requests[0].url, "https://api.example.test/api/contacts?limit=10&archived=false");
  assert.equal(requests[0].init.method, undefined);
  assert.equal(requests[0].init.credentials, "include");
  assert.equal(new Headers(requests[0].init.headers).get("x-api-key"), "test");
});

test("serializa JSON e envia autenticação por header", async () => {
  const { client, requests } = mockedClient();
  await client.messages.sendText(23, { text: "Olá" });
  assert.equal(requests[0].url, "https://api.example.test/api/contacts/23/send");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(new Headers(requests[0].init.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(requests[0].init.body), { text: "Olá" });
});

test("usa os campos de payload esperados pelas rotas de mensagens e conversas", async () => {
  const { client, requests } = mockedClient();
  await client.messages.react(12, null);
  await client.messages.delete(12, "everyone");
  await client.internalConversations.addParticipants("org", "conversation", ["user-1"]);
  assert.deepEqual(JSON.parse(requests[0].init.body), { reaction: "" });
  assert.equal(requests[1].url, "https://api.example.test/api/messages/12?scope=everyone");
  assert.deepEqual(JSON.parse(requests[2].init.body), { participantIds: ["user-1"] });
});

test("mapeia cada namespace às rotas do backend", async () => {
  const { client, requests } = mockedClient();
  await client.auth.getSession();
  await client.contacts.search({ query: "maria" });
  await client.messages.list(3, { limit: 15, before: 20 });
  await client.ai.rewrite("texto");
  await client.transcription.getSettings();
  await client.notifications.markRead(7);
  await client.push.subscribe({ endpoint: "https://push.test", keys: { p256dh: "p", auth: "a" } });
  await client.evolution.callSettings();
  await client.bots.setActivation("bot-1", true);
  await client.organizations.workspace("org 1");
  await client.internalConversations.bootstrap("org 1");
  await client.invitations.get("invite-1");
  await client.calendarEvents.list({ from: "2026-01-01", to: "2026-01-31" });
  await client.scheduledMessages.list({ from: "2026-01-01", to: "2026-01-31" });
  await client.clients.list();
  assert.deepEqual(requests.map(({ url, init }) => [new URL(url).pathname, init.method ?? "GET"]), [
    ["/api/auth/get-session", "GET"],
    ["/api/contacts/search", "GET"],
    ["/api/contacts/3/messages", "GET"],
    ["/api/ai/rewrite", "POST"],
    ["/api/transcription/settings", "GET"],
    ["/api/notifications/7/read", "PATCH"],
    ["/api/push/subscribe", "POST"],
    ["/api/evolution/call-settings", "GET"],
    ["/api/bots/bot-1/activation", "POST"],
    ["/api/organizations/org%201/workspace", "GET"],
    ["/api/organizations/org%201/internal-conversations/bootstrap", "GET"],
    ["/api/invitations/invite-1", "GET"],
    ["/api/calendar-events", "GET"],
    ["/api/scheduled-messages", "GET"],
    ["/api/clients", "GET"],
  ]);
});

test("usa multipart sem definir Content-Type manualmente", async () => {
  const { client, requests } = mockedClient();
  await client.messages.sendMedia(4, { file: new Blob(["arquivo"], { type: "text/plain" }), fileName: "teste.txt", caption: "legenda" });
  assert.equal(requests[0].url, "https://api.example.test/api/contacts/4/send-media");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.body.get("caption"), "legenda");
  assert.equal(requests[0].init.body.get("file").name, "teste.txt");
  assert.equal(new Headers(requests[0].init.headers).has("content-type"), false);
});

test("retorna Blob e undefined para mídia e respostas 204", async () => {
  const { client, requests } = mockedClient([
    new Response(new Blob(["conteúdo"], { type: "image/png" })),
    new Response(null, { status: 204 }),
  ]);
  const media = await client.messages.media(9);
  assert.ok(media instanceof Blob);
  assert.equal(await media.text(), "conteúdo");
  assert.equal(requests[0].url, "https://api.example.test/api/messages/9/media");
  assert.equal(await client.contacts.delete(2), undefined);
});

test("solicita download e suporta Range em mídia de conversa interna", async () => {
  const { client, requests } = mockedClient();
  await client.messages.media(9, { download: true });
  await client.internalConversations.media("org", "conversation", 12, { download: true, range: "bytes=0-10" });
  assert.equal(requests[0].url, "https://api.example.test/api/messages/9/media?download=1");
  assert.equal(requests[1].url, "https://api.example.test/api/organizations/org/internal-conversations/conversation/messages/12/media?download=1");
  assert.equal(new Headers(requests[1].init.headers).get("range"), "bytes=0-10");
});

test("converte erros JSON em CotrimBotApiError", async () => {
  const { client } = mockedClient([Response.json({ error: "Não autenticado." }, { status: 401 })]);
  await assert.rejects(client.contacts.list(), (error) => {
    assert.ok(error instanceof CotrimBotApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message, "Não autenticado.");
    assert.deepEqual(error.body, { error: "Não autenticado." });
    return true;
  });
});

test("respeita baseUrl terminada em /api e credentials customizadas", async () => {
  let request;
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test/api/",
    credentials: "same-origin",
    fetch: async (url, init) => { request = { url, init }; return Response.json({}); },
  });
  await client.ai.rewrite("texto");
  assert.equal(request.url, "https://api.example.test/api/ai/rewrite");
  assert.equal(request.init.credentials, "same-origin");
});

test("envia sessão Better Auth como autorização e usa credentials omit por padrão", async () => {
  const requests = [];
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test",
    token: "signed-session-token",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return Response.json({});
    },
  });
  await client.contacts.list();
  assert.equal(new Headers(requests[0].init.headers).get("authorization"), ["Bearer ", "signed-session-token"].join(""));
  assert.equal(requests[0].init.credentials, "omit");
});

test("captures the session token returned by Better Auth, reuses it, and clears it on sign-out", async () => {
  const requests = [];
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test",
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (requests.length === 1) {
        return Response.json({ token: "session" }, { headers: { "set-auth-token": "signed-session-token" } });
      }
      return Response.json([]);
    },
  });
  await client.auth.signInEmail({ email: "user@example.test", password: "password" });
  assert.equal(client.auth.getToken(), "signed-session-token");
  await client.contacts.list();
  assert.equal(new Headers(requests[1].init.headers).get("authorization"), ["Bearer ", "signed-session-token"].join(""));
  await client.auth.signOut();
  assert.equal(client.auth.getToken(), undefined);
});

test("autentica automaticamente na primeira chamada e reutiliza o token", async () => {
  const requests = [];
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test",
    auth: { email: "user@example.test", password: "password" },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (requests.length === 1) {
        return Response.json({ token: "session" }, { headers: { "set-auth-token": "automatic-token" } });
      }
      return Response.json({ contacts: [] });
    },
  });

  await client.contacts.list();
  assert.equal(new URL(requests[0].url).pathname, "/api/auth/sign-in/email");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    email: "user@example.test",
    password: "password",
  });
  assert.equal(new Headers(requests[1].init.headers).get("authorization"), ["Bearer ", "automatic-token"].join(""));
  assert.equal(client.auth.getToken(), "automatic-token");
  await client.contacts.list();
  assert.equal(requests.length, 3);
  assert.equal(new Headers(requests[2].init.headers).get("authorization"), ["Bearer ", "automatic-token"].join(""));
});

test("renova automaticamente a sessão revogada e repete a chamada uma vez", async () => {
  const requests = [];
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test",
    auth: { email: "user@example.test", password: "password" },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (requests.length === 1) {
        return Response.json({}, { headers: { "set-auth-token": "old-token" } });
      }
      if (requests.length === 2) {
        return Response.json({ error: "Não autenticado." }, { status: 401 });
      }
      if (requests.length === 3) {
        return Response.json({}, { headers: { "set-auth-token": "new-token" } });
      }
      return Response.json({ contacts: [] });
    },
  });

  await client.contacts.list();
  assert.equal(requests.length, 4);
  assert.equal(new URL(requests[2].url).pathname, "/api/auth/sign-in/email");
  assert.equal(new Headers(requests[3].init.headers).get("authorization"), ["Bearer ", "new-token"].join(""));
  assert.equal(client.auth.getToken(), "new-token");
});

test("restaura a organização ativa antes de repetir uma chamada após reautenticação", async () => {
  const requests = [];
  let signInCount = 0;
  let botRequestCount = 0;
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test",
    auth: { email: "user@example.test", password: "password" },
    fetch: async (url, init) => {
      requests.push({ url, init });
      const path = new URL(url).pathname;
      if (path.endsWith("/auth/sign-in/email")) {
        signInCount += 1;
        return Response.json({}, { headers: { "set-auth-token": `session-${signInCount}` } });
      }
      if (path.endsWith("/auth/organization/set-active")) return Response.json({});
      if (path.endsWith("/bots")) {
        botRequestCount += 1;
        return botRequestCount === 1
          ? Response.json({ error: "Não autenticado." }, { status: 401 })
          : Response.json({ id: "bot-1" });
      }
      return Response.json({});
    },
  });

  await client.auth.setActiveOrganization("chosen-org");
  await client.bots.create({ name: "Bot", draft: {} });
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/api/auth/sign-in/email",
    "/api/auth/organization/set-active",
    "/api/bots",
    "/api/auth/sign-in/email",
    "/api/auth/organization/set-active",
    "/api/bots",
  ]);
  assert.deepEqual(JSON.parse(requests[4].init.body), { organizationId: "chosen-org" });
  assert.equal(new Headers(requests[4].init.headers).get("authorization"), ["Bearer ", "session-2"].join(""));
});

test("não repete a chamada se não conseguir restaurar a organização ativa", async () => {
  const requests = [];
  let organizationSelectionCount = 0;
  let botRequestCount = 0;
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test",
    auth: { email: "user@example.test", password: "password" },
    fetch: async (url, init) => {
      requests.push({ url, init });
      const path = new URL(url).pathname;
      if (path.endsWith("/auth/sign-in/email")) {
        return Response.json({}, { headers: { "set-auth-token": `session-${requests.length}` } });
      }
      if (path.endsWith("/auth/organization/set-active")) {
        organizationSelectionCount += 1;
        return organizationSelectionCount === 1
          ? Response.json({})
          : Response.json({ error: "Sem acesso." }, { status: 403 });
      }
      if (path.endsWith("/bots")) {
        botRequestCount += 1;
        return Response.json({ error: "Não autenticado." }, { status: 401 });
      }
      return Response.json({});
    },
  });

  await client.auth.setActiveOrganization("chosen-org");
  await assert.rejects(client.bots.create({ name: "Bot", draft: {} }), { status: 403 });
  assert.equal(botRequestCount, 1);
  assert.equal(client.auth.getToken(), undefined);
});

test("logout explícito não inicia novamente o login automático", async () => {
  const requests = [];
  const client = new CotrimBotClient({
    baseUrl: "https://api.example.test",
    auth: { email: "user@example.test", password: "password" },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (requests.length === 1) {
        return Response.json({}, { headers: { "set-auth-token": "session-token" } });
      }
      return Response.json({});
    },
  });

  await client.contacts.list();
  await client.auth.signOut();
  await client.contacts.list();
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    "/api/auth/sign-in/email",
    "/api/contacts",
    "/api/auth/sign-out",
    "/api/contacts",
  ]);
  assert.equal(new Headers(requests[3].init.headers).has("authorization"), false);
});
