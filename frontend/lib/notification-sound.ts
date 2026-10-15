const SOUND_KEY = "cotrimbot:notification-sound";
const SOUND_PATH_KEY = "cotrimbot:notification-sound-path";
export const NOTIFICATION_SOUND_OPTIONS = [
  { path: "/audio/notification-reply.mp3", label: "Som padrão" },
  { path: "/audio/notifications/01_ah.mp3", label: "Ah" },
  { path: "/audio/notifications/02_risada_curta.mp3", label: "Risada curta" },
  { path: "/audio/notifications/03_nao_nao_kevin.mp3", label: "Não, não Kevin" },
  { path: "/audio/notifications/04_mina_dua_spita.mp3", label: "Mina Dua Spita" },
  { path: "/audio/notifications/05_gargalhada.mp3", label: "Gargalhada" },
  { path: "/audio/notifications/06_mina_dua_risada.mp3", label: "Mina Dua risada" },
  { path: "/audio/notifications/07_grunhido.mp3", label: "Grunhido" },
  { path: "/audio/notifications/08_pakao.mp3", label: "Pakao" },
  { path: "/audio/notifications/09_grito.mp3", label: "Grito" },
  { path: "/audio/notifications/10_fala_final.mp3", label: "Fala final" },
] as const;

let notificationAudio: HTMLAudioElement | null = null;

export function isNotificationSoundEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SOUND_KEY) !== "off";
}

export function setNotificationSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
}

export function getNotificationSoundPath() {
  if (typeof window === "undefined") return NOTIFICATION_SOUND_OPTIONS[0].path;
  const savedPath = window.localStorage.getItem(SOUND_PATH_KEY);
  return NOTIFICATION_SOUND_OPTIONS.some((option) => option.path === savedPath)
    ? savedPath!
    : NOTIFICATION_SOUND_OPTIONS[0].path;
}

export function setNotificationSoundPath(path: string) {
  if (!NOTIFICATION_SOUND_OPTIONS.some((option) => option.path === path)) {
    throw new Error("Áudio de notificação inválido.");
  }
  window.localStorage.setItem(SOUND_PATH_KEY, path);
  notificationAudio = null;
}

export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    notificationAudio ??= new Audio(getNotificationSoundPath());
    notificationAudio.currentTime = 0;
    void notificationAudio.play().catch(() => {
      // Navegadores podem bloquear áudio antes da primeira interação do usuário.
    });
  } catch {
    // Navegadores podem bloquear áudio antes da primeira interação do usuário.
  }
}
