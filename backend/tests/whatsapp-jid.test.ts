import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWhatsAppJid, whatsAppJidIdentifier } from "../src/utils/whatsapp-jid.js";

test("remove o sufixo de dispositivo sem criar outro telefone", () => {
  assert.equal(
    normalizeWhatsAppJid("5511932075075:0@s.whatsapp.net"),
    "5511932075075@s.whatsapp.net",
  );
  assert.equal(whatsAppJidIdentifier("5511932075075:0@s.whatsapp.net"), "5511932075075");
  assert.equal(whatsAppJidIdentifier("5511932075075:12"), "5511932075075");
});

test("normaliza LID, mas preserva o identificador completo de grupos", () => {
  assert.equal(normalizeWhatsAppJid("123456:3@lid"), "123456@lid");
  assert.equal(whatsAppJidIdentifier("123456:3@lid"), "123456");
  assert.equal(
    whatsAppJidIdentifier("120363012345678901@g.us"),
    "120363012345678901@g.us",
  );
});
