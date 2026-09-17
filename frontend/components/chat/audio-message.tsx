"use client";

import { useState } from "react";
import { transcribeMessage } from "@/lib/chat-api";
import { TranscriptionSettings } from "@/components/chat/transcription-settings";

type AudioMessageProps = {
  mediaUrl: string;
  messageId: number;
};

export function AudioMessage({
  mediaUrl,
  messageId,
}: AudioMessageProps) {
  const [transcription, setTranscription] =
    useState<string | null>(null);

  const [transcribing, setTranscribing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function handleTranscribe() {
    if (transcribing) return;

    try {
      setTranscribing(true);
      setError(null);

      const result =
        await transcribeMessage(messageId);

      setTranscription(
        result.transcription
      );
    } catch (error) {
      console.error(
        "Erro ao transcrever:",
        error
      );

      setError(
        "Não foi possível transcrever o áudio."
      );
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
      <audio
        controls
        preload="none"
        src={mediaUrl}
        className="min-w-0 max-w-full flex-1"
        aria-label="Áudio da mensagem"
      >
        Seu navegador não suporta a reprodução de áudio.
      </audio>
      <TranscriptionSettings disabled={transcribing} />
      </div>

      {!transcription && (
        <button
          type="button"
          onClick={handleTranscribe}
          disabled={transcribing}
          aria-busy={transcribing}
          className="text-sm font-medium underline disabled:opacity-50"
        >
          {transcribing
            ? "Transcrevendo..."
            : "Transcrever áudio"}
        </button>
      )}

      {transcription && (
        <div className="rounded-lg bg-black/20 p-3">
          <p className="mb-1 text-xs font-medium opacity-70">
            📝 Transcrição
          </p>

          <p className="cursor-text whitespace-pre-wrap text-sm">
            {transcription}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
