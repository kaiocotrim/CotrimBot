import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordingAttachment, recordingLevel } from '../src/lib/recording-preview.ts';

test('recording waveform clamps noisy or unavailable microphone measurements', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, -160, -60]) assert.equal(recordingLevel(value), 3);
  assert.equal(recordingLevel(0), 36);
  assert.equal(recordingLevel(20), 36);
  assert.ok(recordingLevel(-40) < recordingLevel(-20));
});

test('recordings require a real file and sufficient duration before preview or upload', () => {
  for (const duration of [0, -1, 299, NaN, Infinity]) assert.throws(() => recordingAttachment('file:///recording.m4a', duration), /curto/);
  assert.throws(() => recordingAttachment(null, 5000), /curto/);
  const file = recordingAttachment('file:///recording.m4a', 300);
  assert.equal(file.uri, 'file:///recording.m4a');
  assert.equal(file.mimeType, 'audio/mp4');
  assert.match(file.name, /^audio-\d+\.m4a$/);
});

test('the bundled recording cue is a short local PCM sound', () => {
  const data = readFileSync(new URL('../assets/sounds/record-start.wav', import.meta.url));
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  const seconds = data.readUInt32LE(40) / data.readUInt32LE(28);
  assert.ok(seconds > 0 && seconds < .15);
});
