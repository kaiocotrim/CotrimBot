const SOUND_KEY = "cotrimbot:notification-sound";
const NOTIFICATION_SOUND_PATH = "/audio/notification-reply.mp3";

let notificationAudio: HTMLAudioElement | null = null;

export function isNotificationSoundEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SOUND_KEY) !== "off";
}

export function setNotificationSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
}

export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    notificationAudio ??= new Audio(NOTIFICATION_SOUND_PATH);
    notificationAudio.currentTime = 0;
    void notificationAudio.play().catch(() => {
      // Navegadores podem bloquear áudio antes da primeira interação do usuário.
    });
  } catch {
    // Navegadores podem bloquear áudio antes da primeira interação do usuário.
  }
}
