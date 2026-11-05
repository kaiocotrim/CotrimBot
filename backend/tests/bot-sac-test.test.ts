import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceBot, validateFlow, type BotState } from '../src/services/bot-flow.js';
import { SAC_TEST_CATALOG } from '../src/services/bot-sac-test.js';
import { fixture } from './bot-fixture.js';
const inputs = ['1', '05.540.238/0001-23', '1', 'José da Silva', '(27) 99999-9999', '1', 'teste@example.com'];
function setup() {
  const flow = fixture(); flow.menus[0]!.options[0]!.action = 'SAC_TEST';
  flow.menus[0]!.options[0]!.response = ''; validateFlow(flow, true);
  return { flow, start: advanceBot(flow, null, 'Oi').state };
}
test('six stages follow order, survive JSON reload and pause after email without submitting', () => {
  const { flow, start } = setup(); let state = start;
  const steps = ['cnpj', 'confirmCnpj', 'requester', 'phone', 'address', 'email', 'nextStep'];
  for (const [index, text] of inputs.entries()) {
    const snapshot = structuredClone(state); const result = advanceBot(flow, state, text);
    assert.deepEqual(state, snapshot); assert.equal(result.state.sacTest?.step, steps[index]);
    assert.equal('sacTestSubmission' in result, false);
    state = JSON.parse(JSON.stringify(result.state));
  }
  assert.equal(state.sacTest?.data.requester, 'José da Silva');
  assert.equal(state.sacTest?.data.phone, '27999999999');
  assert.equal(state.sacTest?.data.addressId, 'sac-demo-address');
  assert.ok(!state.sacTest?.data.addressLabel?.includes(', ,'));
  for (const input of ['1', '2', 'problema']) assert.deepEqual(advanceBot(flow, state, input).state, state);
});
test('cancel commands immediately clear collection at every stage', () => {
  const { flow, start } = setup(); let state = start; const states: BotState[] = [];
  for (const text of inputs) { state = advanceBot(flow, state, text).state; states.push(state); }
  for (const snapshot of states) for (const command of ['0', 'cancelar', ' CANCELAR ']) {
    const result = advanceBot(flow, snapshot, command);
    assert.equal(result.state.sacTest, undefined); assert.match(result.text, /Atendimento cancelado/);
    assert.match(advanceBot(flow, result.state, '0').text, /Assistente Infordoc/);
    assert.equal(advanceBot(flow, result.state, '1').state.sacTest?.step, 'cnpj');
  }
});
test('invalid values and media stay at their stage; correction clears CNPJ', () => {
  const { flow, start } = setup(); let state = advanceBot(flow, start, '1').state;
  for (const text of ['05540238000124', '11222333000181', '00000000000000', '', 'abrir chamado']) assert.equal(advanceBot(flow, state, text).state.sacTest?.step, 'cnpj');
  state = advanceBot(flow, state, '05540238000123').state;
  assert.equal(advanceBot(flow, state, '8').state.sacTest?.step, 'confirmCnpj');
  const correction = advanceBot(flow, state, '2'); assert.equal(correction.state.sacTest?.step, 'cnpj'); assert.deepEqual(correction.state.sacTest?.data, {});
  state = advanceBot(flow, state, '1').state;
  for (const text of ['', '123', '!!!']) assert.equal(advanceBot(flow, state, text).state.sacTest?.step, 'requester');
  assert.equal(advanceBot(flow, state, 'arquivo.pdf', { inputType: 'DOCUMENT' }).state.sacTest?.step, 'requester');
  state = advanceBot(flow, state, 'Pessoa Teste').state;
  for (const text of ['123', '20999999999', '2799999999', '27999999999abc']) assert.equal(advanceBot(flow, state, text).state.sacTest?.step, 'phone');
  state = advanceBot(flow, state, '+55 (27) 99999-9999').state; assert.equal(state.sacTest?.data.phone, '27999999999');
  assert.equal(advanceBot(flow, state, '999').state.sacTest?.step, 'address');
  state = advanceBot(flow, state, '1').state;
  for (const text of ['', 'email', 'a@b', 'a@b..com']) assert.equal(advanceBot(flow, state, text).state.sacTest?.step, 'email');
});
test('dynamic addresses are formatted and absent addresses never invented', () => {
  const { flow, start } = setup(); let state = start;
  for (const input of inputs.slice(0, 4)) state = advanceBot(flow, state, input).state;
  const catalog = structuredClone(SAC_TEST_CATALOG); catalog[0]!.addresses = [];
  assert.equal(advanceBot(flow, state, inputs[4]!, { catalog }).state.sacTest?.step, 'phone');
  catalog[0]!.addresses = [{ id: 'empty', address: ', , ' }, { id: 'a', address: 'Rua A, , Cidade, ' }, { id: 'b', address: 'Rua B,, Cidade' }];
  const phone = advanceBot(flow, state, inputs[4]!, { catalog });
  assert.ok(phone.text.includes('Rua A, Cidade')); assert.ok(phone.text.includes('Rua B, Cidade'));
  const address = advanceBot(flow, phone.state, '2', { catalog });
  assert.equal(address.state.sacTest?.data.addressId, 'b'); assert.equal(address.state.sacTest?.data.addressLabel, 'Rua B, Cidade');
});
test('disabled test mode cannot start collection', () => {
  const { flow, start } = setup(); const result = advanceBot(flow, start, '1', { testMode: false });
  assert.equal(result.state.sacTest, undefined); assert.match(result.text, /desativada/);
});
test('legacy post-email sessions stop at nextStep and preserve data', () => {
  const { flow, start } = setup(); let state = start;
  for (const text of inputs) state = advanceBot(flow, state, text).state;
  for (const step of ['equipment', 'description', 'review', 'edit']) {
    const legacy = JSON.parse(JSON.stringify(state)); legacy.sacTest.step = step;
    const result = advanceBot(flow, legacy, '1'); assert.equal(result.state.sacTest?.step, 'nextStep'); assert.deepEqual(result.state.sacTest?.data, state.sacTest?.data);
  }
});
