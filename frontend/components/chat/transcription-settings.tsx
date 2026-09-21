"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getTranscriptionSettings, updateTranscriptionSettings, type TranscriptionSettings as Settings } from "@/lib/transcription-settings";
import type { TranscriptionModel } from "@/types/transcription";

const models: { value: TranscriptionModel; label: string }[] = [
  { value: "tiny", label: "Tiny" },
  { value: "base", label: "Base" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
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
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
    >
      <button
        type="button"
        aria-label="Configurações de transcrição"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (open) {
            if (!saving) setOpen(false);
          } else {
            void showSettings();
          }
        }}
        className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-green-500"
      >
        <svg className={`size-[18px] transition-transform duration-500 ease-out motion-reduce:transition-none ${open ? "rotate-90" : "rotate-0"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3-1.5-2v-3L20 8.5l-2-3-2 .5-2-1-.5-2Z" />
          <circle cx="11" cy="12" r="3" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="transcription-settings"
            id={id}
            initial={{ opacity: 0, x: reduceMotion ? 0 : -4, scale: reduceMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: reduceMotion ? 0 : -3, scale: reduceMotion ? 1 : 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "bottom left" }}
            className="absolute bottom-0 left-full z-50 w-[174px] max-w-[80vw] pl-[10px]"
          >
            <div className="box-border min-w-0 overflow-hidden rounded-xl border border-white/15 bg-zinc-900/95 p-1 text-left text-zinc-100 shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
              <p className="px-2 pt-1 pb-1 text-[9px] leading-4 font-medium tracking-wide text-zinc-400 uppercase">Modelo de transcrição</p>

              {loading && <p role="status" className="px-2 py-1.5 text-xs text-zinc-400">Carregando...</p>}

              {settings && (
                <fieldset disabled={saving || disabled} aria-busy={saving} className="m-0 min-w-0 w-full space-y-0.5 border-0 p-0 disabled:opacity-60">
                  <legend className="sr-only">Escolha o modelo Whisper</legend>
                  {models.map((model) => {
                    const selected = settings.model === model.value;
                    return (
                      <label
                        key={model.value}
                        className={`box-border flex h-7 w-full min-w-0 cursor-pointer items-center rounded-lg px-2 text-xs transition-colors duration-150 hover:bg-white/[0.07] focus-within:ring-1 focus-within:ring-white/30 motion-reduce:transition-none ${selected ? "bg-white/[0.12] text-white" : "text-zinc-200"}`}
                      >
                        <input type="radio" name={id} value={model.value} checked={selected} onChange={() => void chooseModel(model.value)} className="sr-only" />
                        <span className="min-w-0 flex-1">{model.label}</span>
                        {selected && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0 text-blue-400" aria-hidden="true">
                            <path d="m5 12 4 4L19 6" />
                          </svg>
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              )}

              {saving && <p role="status" className="px-2 py-1 text-[11px] text-zinc-400">Alterando...</p>}
              {error && <p role="alert" className="px-2 py-1 text-[11px] text-red-400">{error}</p>}
              {error && !settings && <button type="button" onClick={() => void showSettings()} className="px-2 py-1 text-xs underline">Tentar novamente</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
