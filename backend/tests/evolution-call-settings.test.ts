import assert from "node:assert/strict";
import test from "node:test";
import {
  EvolutionSettingsError,
  getWhatsAppCallSettings,
  updateWhatsAppCallSettings,
} from "../src/services/evolution.service.js";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  url: process.env.EVOLUTION_API_URL,
  key: process.env.EVOLUTION_API_KEY,
  instance: process.env.EVOLUTION_INSTANCE,
};

function configureEvolution() {
  process.env.EVOLUTION_API_URL = "https://evolution.example/";
  process.env.EVOLUTION_API_KEY = "secret-test-key";
  process.env.EVOLUTION_INSTANCE = "atendimento principal";
}

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [
    ["EVOLUTION_API_URL", originalEnvironment.url],
    ["EVOLUTION_API_KEY", originalEnvironment.key],
    ["EVOLUTION_INSTANCE", originalEnvironment.instance],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const currentSettings = {
  rejectCall: false,
  msgCall: "Mensagem anterior",
  groupsIgnore: true,
  alwaysOnline: true,
  readMessages: false,
  readStatus: true,
  syncFullHistory: false,
  wavoipToken: "token-existente",
};

test("lê a configuração de chamadas da instância correta", async () => {
  configureEvolution();
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://evolution.example/settings/find/atendimento%20principal");
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("apikey"), "secret-test-key");
    return Response.json(currentSettings);
  };

  try {
    assert.deepEqual(await getWhatsAppCallSettings(), {
      rejectCall: false,
      msgCall: "Mensagem anterior",
    });
  } finally {
    restoreEnvironment();
  }
});

test("salva a recusa sem alterar as demais configurações e confirma a persistência", async () => {
  configureEvolution();
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  let persisted = { ...currentSettings };

  globalThis.fetch = async (input, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as typeof currentSettings : undefined;
    calls.push({ url: String(input), method, ...(body ? { body } : {}) });
    if (method === "POST" && body) persisted = body;
    return method === "POST"
      ? new Response(null, { status: 201 })
      : Response.json(persisted);
  };

  try {
    const result = await updateWhatsAppCallSettings({ rejectCall: true, msgCall: "Atendimento somente por texto." });
    assert.deepEqual(result, { rejectCall: true, msgCall: "Atendimento somente por texto." });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(({ method }) => method), ["GET", "POST", "GET"]);
    assert.deepEqual(calls[1]?.body, {
      ...currentSettings,
      rejectCall: true,
      msgCall: "Atendimento somente por texto.",
    });
  } finally {
    restoreEnvironment();
  }
});

test("classifica falha de autenticação sem incluir a resposta sensível", async () => {
  configureEvolution();
  globalThis.fetch = async () => new Response("secret-test-key", { status: 401 });

  try {
    await assert.rejects(
      getWhatsAppCallSettings(),
      (error: unknown) => error instanceof EvolutionSettingsError
        && error.code === "authentication"
        && !error.message.includes("secret-test-key"),
    );
  } finally {
    restoreEnvironment();
  }
});
