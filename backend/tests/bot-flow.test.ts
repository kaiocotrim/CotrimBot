import test from "node:test";
import assert from "node:assert/strict";
import { advanceBot, validateFlow } from "../src/services/bot-flow.js";
import { authenticateBotWebhook } from "../src/services/bot-webhook-auth.js";
import { fixture } from "./bot-fixture.js";

test("published Infordoc flow navigates responses, submenus, previous menu, invalid and inactive options", () => {
  const flow = fixture(); validateFlow(flow, true);
  const start = advanceBot(flow, null, "Olá");
  assert.match(start.text, /Assistente Infordoc/);
  assert.doesNotMatch(start.text, /Criar login/);
  const answer = advanceBot(flow, start.state, " 1 ");
  assert.match(answer.text, /sac.infordoc.com.br/);
  assert.match(advanceBot(flow, answer.state, "0").text, /Assistente Infordoc/);
  const submenu = advanceBot(flow, start.state, "3");
  assert.equal(submenu.state.menuId, "scanner-menu");
  assert.equal(advanceBot(flow, submenu.state, "0").state.menuId, "main");
  assert.match(advanceBot(flow, start.state, "2").text, /válida/);
  assert.match(advanceBot(flow, start.state, "999").text, /válida/);
  const human = advanceBot(flow, submenu.state, "4");
  assert.equal(human.state.status, "WAITING_HUMAN");
  for (const status of ["WAITING_HUMAN", "HUMAN_ACTIVE", "CLOSED"] as const) assert.equal(advanceBot(flow, { ...human.state, status }, "0").text, "");
  assert.match(advanceBot(flow, null, "0").text, /Assistente Infordoc/);
});

test("draft edits do not mutate the published snapshot; add, edit, duplicate and remove options", () => {
  const published = fixture(), draft = structuredClone(published);
  draft.menus[0]!.options.push({ ...draft.menus[0]!.options[0]!, id: "copy", number: "5" });
  draft.menus[0]!.options[0]!.response = "Nova resposta";
  validateFlow(draft, true);
  assert.equal(published.menus[0]!.options.length, 3);
  assert.doesNotMatch(published.menus[0]!.options[0]!.response, /Nova resposta/);
  draft.menus[0]!.options.splice(3, 1); validateFlow(draft, true);
});

test("reject duplicate numbers, non-string numbers, missing menus and incomplete publication", () => {
  const duplicate = fixture(); duplicate.menus[0]!.options[1]!.number = "1";
  assert.throws(() => validateFlow(duplicate), /duplicado/);
  const missing = fixture(); missing.menus[0]!.options[1]!.targetMenuId = "missing";
  assert.throws(() => validateFlow(missing), /existente/);
  const incomplete = fixture(); incomplete.menus[0]!.options[0]!.response = "";
  validateFlow(incomplete); assert.throws(() => validateFlow(incomplete, true), /resposta/);
  assert.throws(() => advanceBot(incomplete, advanceBot(incomplete, null, "").state, "1"), /incompleta/);
  for (const value of [null, {}, { ...fixture(), menus: [] }]) assert.throws(() => validateFlow(value));
  const numeric = fixture(); (numeric.menus[0]!.options[0] as unknown as { number: unknown }).number = 1;
  assert.throws(() => validateFlow(numeric));
});

test("options can return to the start and show its image without keeping obsolete back history", () => {
  const flow = fixture();
  flow.menus[0]!.imageId = "welcome-photo";
  flow.menus[1]!.options.push({ id: "restart", number: "5", label: "Voltar ao início", active: true, action: "SUBMENU", response: "", targetMenuId: flow.rootMenuId });
  validateFlow(flow);
  validateFlow(flow, true);
  let reply = advanceBot(flow, null, "Oi");
  for (let i = 0; i < 50; i++) {
    reply = advanceBot(flow, reply.state, "3");
    assert.deepEqual(reply.state.stack, [flow.rootMenuId]);
    reply = advanceBot(flow, reply.state, "5");
    assert.equal(reply.state.menuId, flow.rootMenuId);
    assert.deepEqual(reply.state.stack, []);
    assert.equal(reply.imageId, "welcome-photo");
    assert.match(reply.text, /Assistente Infordoc/);
  }
  assert.equal(advanceBot(flow, reply.state, "0").state.menuId, flow.rootMenuId);
});

test("returning to an ancestor or the current menu preserves a bounded back stack", () => {
  const flow = fixture();
  flow.menus[1]!.options.push({ id: "details", number: "5", label: "Detalhes", active: true, action: "SUBMENU", response: "", targetMenuId: "details" });
  flow.menus.push({ id: "details", name: "Detalhes", text: "Escolha uma opção", options: [
    { id: "back-scanner", number: "6", label: "Voltar ao scanner", active: true, action: "SUBMENU", response: "", targetMenuId: "scanner-menu" },
    { id: "repeat", number: "7", label: "Mostrar novamente", active: true, action: "SUBMENU", response: "", targetMenuId: "details" },
  ] });
  validateFlow(flow, true);
  let reply = advanceBot(flow, advanceBot(flow, null, "Oi").state, "3");
  for (let i = 0; i < 50; i++) {
    reply = advanceBot(flow, reply.state, "5");
    reply = advanceBot(flow, reply.state, "7");
    assert.deepEqual(reply.state.stack, ["main", "scanner-menu"]);
    reply = advanceBot(flow, reply.state, "6");
    assert.equal(reply.state.menuId, "scanner-menu");
    assert.deepEqual(reply.state.stack, ["main"]);
  }
  assert.equal(advanceBot(flow, reply.state, "0").state.menuId, "main");
});

test("bot webhook requires a configured secret with an exact match", () => {
  assert.equal(authenticateBotWebhook("valid", "valid"), true);
  assert.equal(authenticateBotWebhook("wrong", "valid"), false);
  assert.equal(authenticateBotWebhook(undefined, "valid"), false);
  assert.equal(authenticateBotWebhook("", ""), false);
});

test("images support menu greetings, submenus, optional captions and returning to text menus", () => {
  const flow = fixture();
  flow.menus[0]!.imageId = "greeting-image";
  flow.menus[0]!.text = "";
  const option = flow.menus[0]!.options[0]!;
  option.action = "IMAGE"; option.imageId = "option-image"; option.response = "";
  flow.menus[1]!.imageId = "submenu-image";
  validateFlow(flow, true);
  const greeting = advanceBot(flow, null, "Oi");
  assert.equal(greeting.imageId, "greeting-image");
  assert.match(greeting.text, /1 — Ajuda/);
  const picture = advanceBot(flow, greeting.state, "1");
  assert.equal(picture.imageId, "option-image");
  assert.equal(picture.text, "0 — Voltar");
  option.response = "Veja como fazer.";
  assert.match(advanceBot(flow, greeting.state, "1").text, /Veja como fazer/);
  assert.equal(advanceBot(flow, greeting.state, "3").imageId, "submenu-image");
  assert.equal(advanceBot(flow, picture.state, "0").imageId, "greeting-image");
  delete option.imageId;
  assert.throws(() => validateFlow(flow, true), /Envie uma imagem/);
  assert.throws(() => advanceBot(flow, greeting.state, "1"), /envie uma imagem/);
  option.imageId = "https://unsafe.example/image.png";
  assert.throws(() => validateFlow(flow), /Opção inválida/);
});

test("message options can include an optional image", () => {
  const flow = fixture();
  const option = flow.menus[0]!.options[0]!;
  option.imageId = "message-image";
  validateFlow(flow, true);
  const reply = advanceBot(flow, advanceBot(flow, null, "Oi").state, option.number);
  assert.equal(reply.imageId, "message-image");
  assert.match(reply.text, /sac\.infordoc\.com\.br/);
});

test("publication identifies an empty disconnected menu by name while drafts remain editable", () => {
  const flow = fixture();
  flow.menus.push({ id: "unused", name: "Menu sem uso", text: "  ", options: [] });
  validateFlow(flow);
  assert.throws(() => validateFlow(flow, true), /Preencha a mensagem do menu "Menu sem uso"/);
});

test("designer positions survive validation without changing navigation and invalid coordinates are rejected", () => {
  const flow = fixture();
  flow.layout = { "main:message": { x: 150, y: 220 } };
  validateFlow(flow, true);
  assert.match(advanceBot(flow, null, "Olá").text, /Assistente Infordoc/);
  const state = advanceBot(flow, null, "Olá").state;
  assert.match(advanceBot(flow, state, "1").text, /sac.infordoc.com.br/);
  for (const position of [{ x: -1, y: 0 }, { x: 0, y: Infinity }, { x: 10001, y: 20 }]) {
    flow.layout = { node: position }; assert.throws(() => validateFlow(flow), /Posição/);
  }
});
