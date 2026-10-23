import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBot, validateFlow, type BotState } from '../src/services/bot-flow.js';
import { fixture } from './bot-fixture.js';

const inputs = ['1', '05540238000123', '1', 'Pessoa Teste', '27999999999', '1', 'teste@example.com', '1', 'Erro 123 no scanner'];
function setup() {
  const flow = fixture();
  flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  flow.menus[0]!.options[0]!.response = '';
  validateFlow(flow, true);
  return { flow, start: advanceBot(flow, null, 'Oi').state };
}

test('coleta valida dados, aceita números na descrição, corrige campo e só submete após confirmar', () => {
  const { flow, start } = setup();
  let state = start;
  for (const text of inputs) {
    const snapshot = structuredClone(state);
    const result = advanceBot(flow, state, text);
    assert.equal(result.sacTestSubmission, undefined);
    assert.deepEqual(state, snapshot, 'transição não modifica o estado anterior');
    state = JSON.parse(JSON.stringify(result.state)); // Como uma sessão recuperada após reinício.
  }
  assert.equal(state.sacTest?.step, 'review');
  state = advanceBot(flow, state, '2').state;
  state = advanceBot(flow, state, '5').state;
  assert.equal(state.sacTest?.step, 'email');
  const invalid = advanceBot(flow, state, 'email-sem-arroba');
  assert.equal(invalid.state.sacTest?.step, 'email');
  assert.match(invalid.text, /E-mail inválido/);
  state = advanceBot(flow, invalid.state, 'corrigido@example.com').state;
  assert.equal(state.sacTest?.step, 'review');
  const done = advanceBot(flow, state, '1');
  assert.equal(done.sacTestSubmission?.data.email, 'corrigido@example.com');
  assert.equal(done.state.sacTest, undefined);
  assert.equal(done.state.status, 'BOT_ACTIVE');
  assert.match(advanceBot(flow, done.state, '0').text, /Assistente Infordoc/);
  assert.equal(advanceBot(flow, done.state, '1').state.sacTest?.step, 'cnpj');
});

test('cancelamento em cada etapa pode continuar sem perder dados ou descartar sem prender a sessão', () => {
  const { flow, start } = setup();
  let state = start;
  const states: BotState[] = [];
  for (const text of inputs) { state = advanceBot(flow, state, text).state; states.push(state); }
  states.push(advanceBot(flow, state, '2').state); // seleção de campo para correção
  for (const snapshot of states) {
    const cancel = advanceBot(flow, snapshot, 'cancelar');
    assert.equal(cancel.state.sacTest?.cancelPending, true);
    assert.equal(advanceBot(flow, cancel.state, '9').state.sacTest?.cancelPending, true);
    const resume = advanceBot(flow, cancel.state, '2');
    assert.deepEqual(resume.state.sacTest?.data, snapshot.sacTest?.data);
    assert.equal(resume.state.sacTest?.step, snapshot.sacTest?.step);
    const cancelled = advanceBot(flow, advanceBot(flow, resume.state, '0').state, '1');
    assert.equal(cancelled.state.sacTest, undefined);
    assert.equal(cancelled.sacTestSubmission, undefined);
    assert.match(advanceBot(flow, cancelled.state, '0').text, /Assistente Infordoc/);
  }
});

test('respostas inválidas, mídia e nova tentativa de início não avançam nem apagam dados', () => {
  const { flow, start } = setup();
  let state = advanceBot(flow, start, '1').state;
  for (const text of ['05540238000124', '11222333000181', '', 'abrir chamado']) {
    const result = advanceBot(flow, state, text);
    assert.equal(result.state.sacTest?.step, 'cnpj');
  }
  state = advanceBot(flow, state, '05540238000123').state;
  assert.equal(advanceBot(flow, state, '8').state.sacTest?.step, 'confirmCnpj');
  state = advanceBot(flow, state, '1').state;
  assert.equal(advanceBot(flow, state, 'arquivo.pdf', { inputType: 'DOCUMENT' }).state.sacTest?.step, 'requester');
  state = advanceBot(flow, state, 'Pessoa Teste').state;
  assert.equal(advanceBot(flow, state, '123').state.sacTest?.step, 'phone');
  state = advanceBot(flow, state, '27999999999').state;
  assert.equal(advanceBot(flow, state, '999').state.sacTest?.step, 'address');
});
