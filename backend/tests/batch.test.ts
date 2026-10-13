import assert from "node:assert/strict";
import test from "node:test";
import { processInBatches } from "../src/utils/batch.js";

test("processa todos os itens, inclusive o último lote parcial, com até cinco operações", async () => {
  const items = Array.from({ length: 13 }, (_, index) => index);
  const processed: number[] = [];
  let active = 0;
  let peak = 0;

  await processInBatches(items, async (item) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    processed.push(item);
    active--;
  });

  assert.equal(peak, 5);
  assert.equal(active, 0);
  assert.deepEqual(processed, items);
  assert.deepEqual(items, Array.from({ length: 13 }, (_, index) => index));
});

test("aguarda o lote inteiro antes de iniciar o próximo", async () => {
  const started: number[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const processing = processInBatches([0, 1, 2], async (item) => {
    started.push(item);
    if (item === 0) await blocked;
  }, 2);

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1]);
  release();
  await processing;
  assert.deepEqual(started, [0, 1, 2]);
});

test("lote de tamanho um permite processamento sequencial", async () => {
  let active = 0;
  await processInBatches([1, 2, 3], async () => {
    assert.equal(++active, 1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
  }, 1);
});

test("lista vazia não executa operações", async () => {
  await processInBatches([], () => assert.fail("não deve executar"));
});

test("propaga falhas e não inicia os lotes seguintes", async () => {
  const started: number[] = [];
  const error = new Error("falha na operação");
  await assert.rejects(processInBatches([0, 1, 2], async (item) => {
    started.push(item);
    if (item === 0) throw error;
  }, 2), error);
  assert.deepEqual(started, [0, 1]);
});

test("rejeita tamanhos de lote inválidos antes de executar operações", async () => {
  for (const size of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(
      processInBatches([1], () => assert.fail("não deve executar"), size),
      RangeError,
    );
  }
});
