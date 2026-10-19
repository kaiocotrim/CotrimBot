export const LOCAL_TRANSCRIPTION_URL = "http://127.0.0.1:8765";
const PREFERENCE_KEY = "cotrimbot.local-transcription";

export function isLocalTranscriptionEnabled(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(PREFERENCE_KEY) === "true";
}

export function setLocalTranscriptionEnabled(enabled: boolean): void {
  window.localStorage.setItem(PREFERENCE_KEY, String(enabled));
}

export async function checkLocalTranscription(): Promise<void> {
  const response = await fetch(`${LOCAL_TRANSCRIPTION_URL}/`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Serviço local indisponível.");
  const data = await response.json();
  if (data.service !== "CotrimBot Transcription" || data.status !== "ok") {
    throw new Error("Aguarde o carregamento do modelo e verifique a conexão novamente.");
  }
}

export async function transcribeLocalAudio(mediaUrl: string): Promise<string> {
  const audio = await fetch(mediaUrl, { credentials: "include", signal: AbortSignal.timeout(30000) });
  if (!audio.ok) throw new Error("Não foi possível baixar o áudio para transcrever.");
  const form = new FormData();
  form.append("file", await audio.blob(), "audio.ogg");
  let response: Response;
  try {
    response = await fetch(`${LOCAL_TRANSCRIPTION_URL}/transcribe`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(600000),
    });
  } catch {
    throw new Error("Não foi possível acessar o transcritor local. Abra o CotrimBotTranscritor.exe e permita o acesso à rede local no navegador.");
  }
  if (!response.ok) throw new Error("O transcritor local não conseguiu processar o áudio. Verifique o log do serviço.");
  const data = await response.json();
  if (typeof data.text !== "string" || !data.text.trim()) throw new Error("Nenhuma fala foi encontrada neste áudio.");
  return data.text;
}
