import type { TranscriptionModel } from "@/types/transcription";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export type TranscriptionSettings = {
  model: TranscriptionModel;
  beam_size: number;
  vad_filter: boolean;
  language: string;
};

export async function getTranscriptionSettings(): Promise<TranscriptionSettings> {
  const response = await fetch(`${API_URL}/transcription/settings`, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar as configurações.");
  return response.json();
}

export async function updateTranscriptionSettings(settings: TranscriptionSettings): Promise<void> {
  const response = await fetch(`${API_URL}/transcription/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error("Não foi possível alterar o modelo. Tente novamente.");
}
