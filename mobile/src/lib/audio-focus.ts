export function createAudioFocus() {
  let player: { id: string; pause: () => void } | null = null;
  let recording: string | null = null;
  function stop(id?: string) {
    if (player && (id === undefined || player.id === id)) {
      const previous = player; player = null;
      try { previous.pause(); } catch { /* The native player may already have been disposed. */ }
    }
  }
  return {
    stop,
    play(id: string, pause: () => void) {
      if (recording !== null) throw new Error('Pare a gravação antes de reproduzir um áudio.');
      if (player?.id !== id) stop();
      player = { id, pause };
    },
    startRecording(id: string) {
      if (recording !== null && recording !== id) throw new Error('Já existe uma gravação em andamento.');
      stop(); recording = id;
    },
    finishRecording(id: string) { if (recording === id) recording = null; },
  };
}

export const audioFocus = createAudioFocus();
export function audioTime(seconds: number) {
  const value = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
