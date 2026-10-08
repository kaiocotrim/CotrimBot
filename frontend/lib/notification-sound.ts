const SOUND_KEY = "cotrimbot:notification-sound";

export function isNotificationSoundEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SOUND_KEY) !== "off";
}

export function setNotificationSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
}

// Gera o aviso com a Web Audio API para não depender de arquivo de áudio.
export function playNotificationSound() {
  try {
    const context = new AudioContext();
    const start = context.currentTime;
    [880, 1318.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.12;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.26);
    });
    window.setTimeout(() => void context.close(), 700);
  } catch {
    // Navegadores podem bloquear áudio antes da primeira interação do usuário.
  }
}
