import type { TranscriptionModel } from "@/types/transcription";
import { isLocalTranscriptionEnabled, LOCAL_TRANSCRIPTION_URL } from "@/lib/local-transcription";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type TranscriptionSettings = {
  model: TranscriptionModel;
  beam_size: number;
  vad_filter: boolean;
  language: string;
};

export async function getTranscriptionSettings(): Promise<TranscriptionSettings> {
  const local = isLocalTranscriptionEnabled();
  const response = await fetch(local ? `${LOCAL_TRANSCRIPTION_URL}/settings` : `${API_URL}/transcription/settings`, { cache: "no-store", credentials: local ? "omit" : "include", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Não foi possível carregar as configurações.");
  return response.json();
}

export async function updateTranscriptionSettings(settings: TranscriptionSettings): Promise<void> {
  const local = isLocalTranscriptionEnabled();
  const response = await fetch(local ? `${LOCAL_TRANSCRIPTION_URL}/settings` : `${API_URL}/transcription/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
    credentials: local ? "omit" : "include",
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) throw new Error("Não foi possível alterar o modelo. Tente novamente.");
}
