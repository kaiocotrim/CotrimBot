"use client";

import { useId, useRef, useState } from "react";
import {
  getTranscriptionSettings,
  updateTranscriptionSettings,
  type TranscriptionSettings as Settings,
} from "@/lib/transcription-settings";
import type { TranscriptionModel } from "@/types/transcription";

const models: { value: TranscriptionModel; label: string; description: string }[] = [
  { value: "tiny", label: "Tiny", description: "Prioriza velocidade" },
  { value: "base", label: "Base", description: "Equilíbrio entre velocidade e precisão" },
  { value: "small", label: "Small", description: "Prioriza precisão" },
  { value: "medium", label: "Medium", description: "Modelo maior, processamento mais demorado" },
];

export function TranscriptionSettings({ disabled }: { disabled: boolean }) {
  const id = useId();
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
      {open && (
        <div id={id} className="absolute right-0 top-full z-30 w-64 max-w-[80vw] pt-2">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-left text-zinc-100 shadow-xl">
            <p className="mb-1 text-sm font-semibold">Modelo de transcrição</p>
            <p className="mb-3 text-xs text-zinc-400">A escolha vale para os próximos áudios de todas as conversas.</p>
            {loading && <p role="status" className="text-xs">Carregando configurações...</p>}
            {settings && (
              <fieldset disabled={saving || disabled} aria-busy={saving} className="space-y-1 disabled:opacity-60">
                <legend className="sr-only">Escolha o modelo Whisper</legend>
                {models.map((model) => (
                  <label key={model.value} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-white/5">
                    <input type="radio" name={id} value={model.value} checked={settings.model === model.value} onChange={() => void chooseModel(model.value)} className="accent-green-500" />
                    <span><span className="block text-sm font-medium">{model.label}</span><span className="block text-xs text-zinc-400">{model.description}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            {saving && <p role="status" className="mt-2 text-xs text-green-400">Carregando o modelo selecionado...</p>}
            {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
            {error && !settings && <button type="button" onClick={() => void showSettings()} className="mt-2 text-xs underline">Tentar novamente</button>}
          </div>
        </div>
      )}
    </div>
  );
}
