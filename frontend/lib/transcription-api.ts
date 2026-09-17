const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3333";

export type TranscriptionSettings = {
  model: string;
  beam_size: number;
  vad_filter: boolean;
  language: string;
};

export async function getTranscriptionSettings(): Promise<TranscriptionSettings> {
  const response = await fetch(
    `${API_URL}/transcription/settings`
  );

  if (!response.ok) {
    throw new Error(
      "Erro ao buscar configurações"
    );
  }

  return response.json();
}

export async function updateTranscriptionSettings(
  settings: TranscriptionSettings
) {
  const response = await fetch(
    `${API_URL}/transcription/settings`,
    {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(settings),
    }
  );

  if (!response.ok) {
    throw new Error(
      "Erro ao salvar configurações"
    );
  }

  return response.json();
}