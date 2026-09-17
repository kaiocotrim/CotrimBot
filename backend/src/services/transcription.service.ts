type AudioToTranscribe = {
  base64: string;
  mimetype: string;
  fileName?: string | undefined;
};

type PythonTranscriptionResponse = {
  text: string;
  language?: string;
};

export async function transcribeAudio({
  base64,
  mimetype,
  fileName,
}: AudioToTranscribe): Promise<string> {
  // Converte o Base64 recebido da Evolution
  // de volta para os bytes reais do áudio.
  const audioBuffer = Buffer.from(
    base64,
    "base64"
  );

  const contentType =
    mimetype.split(";")[0]?.trim() ||
    "audio/ogg";

  // Transforma os bytes em arquivo para
  // enviar ao serviço Python.
  const audioBlob = new Blob(
    [new Uint8Array(audioBuffer)],
    {
      type: contentType,
    }
  );

  const formData = new FormData();

  formData.append(
    "file",
    audioBlob,
    fileName ?? "audio.ogg"
  );

  // Envia o áudio para nosso FastAPI.
  const response = await fetch(
    "http://localhost:5000/transcribe",
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Erro no serviço de transcrição: ${response.status} - ${error}`
    );
  }

  const data =
    (await response.json()) as PythonTranscriptionResponse;

  if (!data.text) {
    throw new Error(
      "O serviço Python não retornou uma transcrição"
    );
  }

  return data.text;
}

export type TranscriptionSettings = {
  model: string;
  beam_size: number;
  vad_filter: boolean;
  language: string;
};

const TRANSCRIPTION_SERVICE_URL =
  "http://localhost:5000";


export async function getTranscriptionSettings(): Promise<TranscriptionSettings> {
  const response = await fetch(
    `${TRANSCRIPTION_SERVICE_URL}/settings`
  );

  if (!response.ok) {
    throw new Error(
      "Erro ao buscar configurações de transcrição"
    );
  }

  return response.json();
}

// Atualiza as configurações de transcrição no serviço Python.

export async function updateTranscriptionSettings(
  settings: TranscriptionSettings
) {
  const response = await fetch(
    `${TRANSCRIPTION_SERVICE_URL}/settings`,
    {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(settings),
    }
  );

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Erro ao atualizar configurações: ${error}`
    );
  }

  return response.json();
}
