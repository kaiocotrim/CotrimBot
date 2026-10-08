import assert from "node:assert/strict";
import test from "node:test";
import { getSignedOutgoingText, SignatureMembershipError } from "../src/services/user-signature.service.js";
import { sendWhatsAppMessage } from "../src/services/evolution.service.js";

const members = [
  { userId: "kaio", organizationId: "empresa-a", signature: "Kaio", signatureEnabled: true },
  { userId: "ana", organizationId: "empresa-a", signature: "Ana", signatureEnabled: true },
  { userId: "kaio", organizationId: "empresa-b", signature: "K. Cotrim", signatureEnabled: true },
  { userId: "bia", organizationId: "empresa-a", signature: "Bia", signatureEnabled: false },
];

const lookup = async (userId: string, organizationId?: string) => members
  .filter((member) => member.userId === userId && (!organizationId || member.organizationId === organizationId))
  .slice(0, 2);

test("atendentes na mesma conexão recebem somente a própria assinatura", async () => {
  assert.equal(await getSignedOutgoingText("kaio", "empresa-a", "Olá, bom dia!", lookup), "*Kaio:* Olá, bom dia!");
  assert.equal(await getSignedOutgoingText("ana", "empresa-a", "Olá, bom dia!", lookup), "*Ana:* Olá, bom dia!");
  assert.equal(await getSignedOutgoingText("bia", "empresa-a", "Olá, bom dia!", lookup), "Olá, bom dia!");
  assert.equal(await getSignedOutgoingText("ana", "empresa-a", "", lookup), "*Ana:*");
});

test("a empresa ativa limita a assinatura e reenvios não a duplicam", async () => {
  assert.equal(await getSignedOutgoingText("kaio", "empresa-b", "Oi", lookup), "*K. Cotrim:* Oi");
  assert.equal(await getSignedOutgoingText("kaio", "empresa-a", "*Kaio:* Oi", lookup), "*Kaio:* Oi");
  assert.equal(await getSignedOutgoingText("kaio", "empresa-a", "Kaio: Oi", lookup), "Kaio: Oi");
  await assert.rejects(getSignedOutgoingText("kaio", undefined, "Oi", lookup), SignatureMembershipError);
  await assert.rejects(getSignedOutgoingText("ana", "empresa-b", "Oi", lookup), SignatureMembershipError);
});

test("o usuário pode enviar sem assinatura sem alterar a configuração da empresa", async () => {
  assert.equal(await getSignedOutgoingText("kaio", "empresa-a", "Sem assinatura", lookup, false), "Sem assinatura");
  assert.equal(await getSignedOutgoingText("kaio", "empresa-a", "Com assinatura", lookup), "*Kaio:* Com assinatura");
  await assert.rejects(getSignedOutgoingText("kaio", undefined, "Sem assinatura", lookup, false), SignatureMembershipError);
});

test("dois usuários enviam textos próprios pela mesma instância da Evolution", async () => {
  const previous = {
    fetch: globalThis.fetch,
    url: process.env.EVOLUTION_API_URL,
    key: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE,
  };
  const sent: Array<{ url: string; number: string; text: string }> = [];
  process.env.EVOLUTION_API_URL = "https://evolution.example";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE = "whatsapp-empresa-a";
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { number: string; text: string };
    sent.push({ url: String(input), ...body });
    return new Response(JSON.stringify({ key: { id: `message-${sent.length}` } }), { status: 200 });
  };

  try {
    for (const userId of ["kaio", "ana"]) {
      const text = await getSignedOutgoingText(userId, "empresa-a", "Olá, bom dia!", lookup);
      await sendWhatsAppMessage("5511999999999", text);
    }
    assert.deepEqual(sent, [
      { url: "https://evolution.example/message/sendText/whatsapp-empresa-a", number: "5511999999999", text: "*Kaio:* Olá, bom dia!" },
      { url: "https://evolution.example/message/sendText/whatsapp-empresa-a", number: "5511999999999", text: "*Ana:* Olá, bom dia!" },
    ]);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [
      ["EVOLUTION_API_URL", previous.url],
      ["EVOLUTION_API_KEY", previous.key],
      ["EVOLUTION_INSTANCE", previous.instance],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
