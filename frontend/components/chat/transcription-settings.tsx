"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  getTranscriptionSettings,
  updateTranscriptionSettings,
  type TranscriptionSettings as Settings,
} from "@/lib/transcription-settings";
import type { TranscriptionModel } from "@/types/transcription";

// Uma cor por modelo; a opção selecionada recebe um fundo suave da mesma cor.
const models: { value: TranscriptionModel; label: string; description: string; color: string }[] = [
  { value: "tiny", label: "Tiny", description: "Prioriza velocidade", color: "#fbbf24" },
  { value: "base", label: "Base", description: "Equilíbrio entre velocidade e precisão", color: "#34d399" },
  { value: "small", label: "Small", description: "Prioriza precisão", color: "#60a5fa" },
  { value: "medium", label: "Medium", description: "Modelo maior, processamento mais demorado", color: "#fb7185" },
];

export function TranscriptionSettings({ disabled }: { disabled: boolean }) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetching = useRef(false);

  async function showSettings() {
    setOpen(true);
    if (fetching.current || saving) return;
    fetching.current = true;
    setLoading(true);
    setError(null);
    setSettings(null);
    try {
      setSettings(await getTranscriptionSettings());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao carregar configurações.");
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }

  async function chooseModel(model: TranscriptionModel) {
    if (!settings || saving || disabled || model === settings.model) return;
    setSaving(true);
    setError(null);
    try {
      const updated = { ...settings, model };
      await updateTranscriptionSettings(updated);
      setSettings(updated);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao alterar modelo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => { if (!open) void showSettings(); }}
      onMouseLeave={() => { if (!saving) setOpen(false); }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
    >
      <button
        type="button"
        aria-label="Configurações de transcrição"
        aria-expanded={open}
        aria-controls={id}
        onFocus={() => { if (!open) void showSettings(); }}
        onClick={() => { if (!open) void showSettings(); }}
        className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-green-500"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3-1.5-2v-3L20 8.5l-2-3-2 .5-2-1-.5-2Z" />
          <circle cx="11" cy="12" r="3" />
        </svg>
      </button>
      {/* Mantém o card montado durante a animação de saída. */}
      <AnimatePresence>
      {open && (
        <motion.div
          key="transcription-settings"
          id={id}
          initial={{ opacity: 0, y: reduceMotion ? 0 : -6, scale: reduceMotion ? 1 : 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -4, scale: reduceMotion ? 1 : 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "top right" }}
          className="absolute right-0 top-full z-30 w-60 max-w-[80vw] pt-2"
        >
          <div className="box-border min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-zinc-900/65 bg-gradient-to-br from-white/[0.08] via-white/[0.02] to-transparent p-2.5 text-left whitespace-normal text-zinc-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14),0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="px-2 pt-1 pb-2">
              <p className="mb-1 break-words text-[13px] leading-5 font-semibold">Modelo de transcrição</p>
              <p className="break-words text-[11px] leading-4 text-zinc-400">A escolha vale para os próximos áudios de todas as conversas.</p>
            </div>
            {loading && <p role="status" className="text-xs">Carregando configurações...</p>}
            {/* Todas as opções têm a mesma largura, altura e área de hover. */}
            {settings && (
              <fieldset disabled={saving || disabled} aria-busy={saving} className="m-0 min-w-0 w-full space-y-1 border-0 p-0 disabled:opacity-60">
                <legend className="sr-only">Escolha o modelo Whisper</legend>
                {models.map((model) => (
                  <label
                    key={model.value}
                    className="box-border flex h-14 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-transparent px-2 py-1 transition-[background-color,border-color] duration-200 hover:bg-white/5 focus-within:ring-1 focus-within:ring-white/30 motion-reduce:transition-none"
                    style={{
                      backgroundColor: settings.model === model.value ? `${model.color}14` : undefined,
                      borderColor: settings.model === model.value ? `${model.color}30` : undefined,
                    }}
                  >
                    <input type="radio" name={id} value={model.value} checked={settings.model === model.value} onChange={() => void chooseModel(model.value)} className="sr-only" />
                    {/* O radio nativo mantém teclado e acessibilidade; este círculo desenha o estado. */}
                    <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: model.color }}>
                      <motion.span initial={false} animate={{ scale: settings.model === model.value ? 1 : 0, opacity: settings.model === model.value ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="size-2 rounded-full" style={{ backgroundColor: model.color }} />
                    </span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] leading-4 font-medium" style={{ color: model.color }}>{model.label}</span><span className="block break-words text-[11px] leading-[14px] text-zinc-400">{model.description}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            {saving && <p role="status" className="mt-2 text-xs text-green-400">Carregando o modelo selecionado...</p>}
            {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
            {error && !settings && <button type="button" onClick={() => void showSettings()} className="mt-2 text-xs underline">Tentar novamente</button>}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
