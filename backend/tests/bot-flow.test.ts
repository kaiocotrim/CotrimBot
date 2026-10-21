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

test("reject duplicate numbers, non-string numbers, cycles, missing menus and incomplete publication", () => {
  const duplicate = fixture(); duplicate.menus[0]!.options[1]!.number = "1";
  assert.throws(() => validateFlow(duplicate), /duplicado/);
  const cycle = fixture(); cycle.menus[0]!.options[1]!.targetMenuId = "main";
  assert.throws(() => validateFlow(cycle), /circulares/);
  const missing = fixture(); missing.menus[0]!.options[1]!.targetMenuId = "missing";
  assert.throws(() => validateFlow(missing), /existente/);
  const incomplete = fixture(); incomplete.menus[0]!.options[0]!.response = "";
  validateFlow(incomplete); assert.throws(() => validateFlow(incomplete, true), /resposta/);
  assert.throws(() => advanceBot(incomplete, advanceBot(incomplete, null, "").state, "1"), /incompleta/);
  for (const value of [null, {}, { ...fixture(), menus: [] }]) assert.throws(() => validateFlow(value));
  const numeric = fixture(); (numeric.menus[0]!.options[0] as unknown as { number: unknown }).number = 1;
  assert.throws(() => validateFlow(numeric));
});

test("bot webhook requires a configured secret with an exact match", () => {
  assert.equal(authenticateBotWebhook("valid", "valid"), true);
  assert.equal(authenticateBotWebhook("wrong", "valid"), false);
  assert.equal(authenticateBotWebhook(undefined, "valid"), false);
  assert.equal(authenticateBotWebhook("", ""), false);
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
