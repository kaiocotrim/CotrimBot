import test from 'node:test';
import assert from 'node:assert/strict';
import { audioTime, createAudioFocus } from '../src/lib/audio-focus.ts';

test('playing another audio pauses the previous player and stale cleanup cannot pause the current one', () => {
  const focus = createAudioFocus(); const stopped = [];
  focus.play('one', () => stopped.push('one'));
  focus.play('two', () => stopped.push('two'));
  assert.deepEqual(stopped, ['one']);
  focus.stop('one'); assert.deepEqual(stopped, ['one']);
  focus.stop('two'); assert.deepEqual(stopped, ['one', 'two']);
});

test('recording stops playback and prevents other players from changing the microphone session', () => {
  const focus = createAudioFocus(); let paused = false;
  focus.play('one', () => { paused = true; });
  focus.startRecording('mic'); assert.equal(paused, true);
  assert.throws(() => focus.play('two', () => {}), /gravação/);
  focus.finishRecording('wrong-owner');
  assert.throws(() => focus.play('two', () => {}));
  focus.finishRecording('mic');
  assert.doesNotThrow(() => focus.play('two', () => {}));
});

test('audio duration formatting tolerates native loading values', () => {
  assert.equal(audioTime(NaN), '0:00'); assert.equal(audioTime(-1), '0:00');
  assert.equal(audioTime(65.8), '1:05'); assert.equal(audioTime(Infinity), '0:00');
});
