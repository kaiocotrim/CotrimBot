"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { transcribeMessage } from "@/lib/chat-api";
import { TranscriptionSettings } from "@/components/chat/transcription-settings";

type AudioMessageProps = {
  mediaUrl: string;
  messageId: number;
};

const PLAYBACK_RATES = [1, 1.5, 2] as const;

// 0 -> 0:00 | 9 -> 0:09 | 65 -> 1:05
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function AudioMessage({ mediaUrl, messageId }: AudioMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  // Player
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);

  // Transcrição
  const [transcription, setTranscription] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [showTranscription, setShowTranscription] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rate = PLAYBACK_RATES[rateIndex];
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  async function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (err) {
      console.error("Erro ao reproduzir áudio:", err);
    }
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = Number(event.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }

  function handleChangeRate() {
    const audio = audioRef.current;
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;

    setRateIndex(next);
    if (audio) audio.playbackRate = PLAYBACK_RATES[next];
  }

  function syncDuration(audio: HTMLAudioElement) {
    if (Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  }

  async function handleTranscribe() {
    if (transcribing) return;

    try {
      setTranscribing(true);
      setError(null);

      const result = await transcribeMessage(messageId);

      setTranscription(result.transcription);
      setShowTranscription(true);
    } catch (err) {
      console.error("Erro ao transcrever:", err);
      setError("Não foi possível transcrever. Tente novamente.");
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="w-full">
      {/* Áudio real, sem controles nativos */}
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onLoadedMetadata={(e) => syncDuration(e.currentTarget)}
        onDurationChange={(e) => syncDuration(e.currentTarget)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        aria-label="Áudio da mensagem"
      />

      <div>
        {/* Player */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
            className="
              flex size-11 shrink-0 items-center justify-center
              rounded-full border border-white/20 bg-gradient-to-br from-white/20 to-white/[0.06] text-white
              shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_6px_18px_rgba(0,0,0,0.25)]
              transition duration-200 ease-out
              hover:bg-white/90 active:scale-95
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-white/60 focus-visible:ring-offset-2
              focus-visible:ring-offset-zinc-900
              motion-reduce:transition-none
            "
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
                <path d="M7 5.75A1.25 1.25 0 0 1 8.25 4.5h1A1.25 1.25 0 0 1 10.5 5.75v12.5a1.25 1.25 0 0 1-1.25 1.25h-1A1.25 1.25 0 0 1 7 18.25V5.75Zm6.5 0a1.25 1.25 0 0 1 1.25-1.25h1A1.25 1.25 0 0 1 17 5.75v12.5a1.25 1.25 0 0 1-1.25 1.25h-1a1.25 1.25 0 0 1-1.25-1.25V5.75Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-4" aria-hidden="true">
                <path d="M8.5 5.8a1 1 0 0 1 1.53-.85l9.1 6.2a1 1 0 0 1 0 1.7l-9.1 6.2a1 1 0 0 1-1.53-.85V5.8Z" />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            {/* Barra de progresso */}
            <div className="group relative flex h-6 items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full border border-white/15 bg-white/10 shadow-inner" />

              <div
                className="pointer-events-none absolute left-0 h-1 rounded-full bg-white/90"
                style={{ width: `${progress}%` }}
              />

              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(currentTime, duration || 0)}
                onChange={handleSeek}
                disabled={duration === 0}
                aria-label="Progresso do áudio"
                aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
                className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0 disabled:cursor-default"
              />

              <div
                className="
                  pointer-events-none absolute size-3.5 -translate-x-1/2
                  rounded-full bg-white shadow-md shadow-black/30
                  opacity-100 scale-100
                  transition duration-150 ease-out
                  group-hover:opacity-100 group-hover:scale-100
                  peer-active:opacity-100 peer-active:scale-100
                  peer-focus-visible:opacity-100 peer-focus-visible:scale-100
                  peer-focus-visible:ring-2 peer-focus-visible:ring-white/50
                  peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-900
                  motion-reduce:transition-none
                "
                style={{ left: `${progress}%` }}
              />
            </div>

            {/* Tempo */}
            <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums text-white/55">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
          {!transcription ? (
            <button
              type="button"
              onClick={handleTranscribe}
              disabled={transcribing}
              aria-busy={transcribing}
              className="
                -ml-1.5 flex items-center gap-1.5 rounded-full px-2.5 py-1.5
                text-[13px] font-medium text-white/80
                transition duration-200 ease-out
                hover:bg-white/[0.08] hover:text-white
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40
                disabled:cursor-not-allowed disabled:opacity-60
                motion-reduce:transition-none
              "
            >
              {transcribing ? (
                <>
                  <svg className="size-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Transcrevendo…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="M12 3v18" />
                    <path d="M8 8v8" />
                    <path d="M4 10v4" />
                    <path d="M16 6v12" />
                    <path d="M20 9v6" />
                  </svg>
                  Transcrever áudio
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowTranscription((v) => !v)}
              aria-expanded={showTranscription}
              className="
                -ml-1.5 flex items-center gap-1.5 rounded-full px-2.5 py-1.5
                text-[13px] font-medium text-white/70
                transition duration-200 ease-out
                hover:bg-white/[0.08] hover:text-white
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40
                motion-reduce:transition-none
              "
            >
              Transcrição
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`size-3 transition-transform duration-200 motion-reduce:transition-none ${showTranscription ? "rotate-180" : ""
                  }`}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleChangeRate}
              aria-label={`Velocidade de reprodução: ${rate}x. Alterar`}
              className="
                min-w-10 rounded-xl border border-white/10 bg-white/[0.06] px-2 py-1.5 text-xs font-medium tabular-nums
                text-white/75 shadow-inner transition duration-200 ease-out
                hover:bg-white/[0.08] hover:text-white
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40
                motion-reduce:transition-none
              "
            >
              {rate}×
            </button>

            {/* Configurações do Whisper */}
            <TranscriptionSettings disabled={transcribing} />
          </div>
        </div>

        {/* Transcrição (abre e fecha com transição suave) */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${transcription && showTranscription ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          aria-hidden={!transcription || !showTranscription}
        >
          <div className="overflow-hidden">
            {transcription && (
              <p className="mt-2 cursor-text whitespace-pre-wrap rounded-2xl bg-black/20 px-3.5 py-3 text-[13.5px] leading-[1.4] font-normal text-white/85">
                {transcription}
              </p>
            )}
          </div>
        </div>

        {/* Erro */}
        {error && (
          <p role="alert" className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
