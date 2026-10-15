"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, PhoneOff, RotateCcw } from "lucide-react";
import styles from "./evolution-call-settings.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type CallSettings = {
  rejectCall: boolean;
  msgCall: string;
  suggestedMessage: string;
};

let cachedSettings: CallSettings | null = null;
let settingsRequest: Promise<CallSettings> | null = null;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(body?.message ?? "Não foi possível acessar as configurações de chamadas.");
  return body as T;
}

function fetchCallSettings() {
  if (cachedSettings) return Promise.resolve(cachedSettings);
  if (!settingsRequest) {
    settingsRequest = fetch(`${API_URL}/evolution/call-settings`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => readJson<CallSettings>(response))
      .then((settings) => {
        cachedSettings = settings;
        return settings;
      })
      .finally(() => {
        settingsRequest = null;
      });
  }
  return settingsRequest;
}

export function EvolutionCallSettings() {
  const [saved, setSaved] = useState<CallSettings | null>(null);
  const [rejectCall, setRejectCall] = useState(false);
  const [msgCall, setMsgCall] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetchCallSettings()
      .then((settings) => {
        if (!active) return;
        setSaved(settings);
        setRejectCall(settings.rejectCall);
        setMsgCall(settings.msgCall);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as configurações.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadKey]);

  const dirty = useMemo(
    () => saved !== null && (rejectCall !== saved.rejectCall || msgCall.trim() !== saved.msgCall),
    [msgCall, rejectCall, saved],
  );
  const invalidMessage = rejectCall && msgCall.trim().length === 0;

  function toggleRejectCalls() {
    const next = !rejectCall;
    setRejectCall(next);
    if (next && !msgCall.trim() && saved?.suggestedMessage) setMsgCall(saved.suggestedMessage);
    setError(null);
    setSuccess(false);
  }

  async function save() {
    if (!saved || !dirty || saving || invalidMessage) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch(`${API_URL}/evolution/call-settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectCall, msgCall: msgCall.trim() }),
      });
      const confirmed = await readJson<Omit<CallSettings, "suggestedMessage">>(response);
      const next = { ...confirmed, suggestedMessage: saved.suggestedMessage };
      cachedSettings = next;
      setSaved(next);
      setMsgCall(confirmed.msgCall);
      setSuccess(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-1 py-4 text-sm text-zinc-400">
        <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
        Carregando configurações de chamadas…
      </div>
    );
  }

  if (!saved) {
    return (
      <section className="px-1 py-3">
        <h3 className="text-lg font-semibold text-white">Chamadas</h3>
        <p role="alert" className="mt-3 text-sm text-red-400">{error ?? "Não foi possível carregar as configurações."}</p>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.06]"
          onClick={() => {
            cachedSettings = null;
            settingsRequest = null;
            setLoading(true);
            setError(null);
            setReloadKey((value) => value + 1);
          }}
        >
          <RotateCcw size={15} aria-hidden="true" /> Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <section className="max-w-2xl px-1 py-3" aria-labelledby="call-settings-title">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-100">
          <PhoneOff size={21} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div>
          <h3 id="call-settings-title" className="text-lg font-semibold text-white">Recusar chamadas automaticamente</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-400">Quando ativado, as chamadas recebidas serão recusadas automaticamente.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rejectCall}
          aria-label={rejectCall ? "Desativar recusa automática" : "Ativar recusa automática"}
          className={styles.callSwitch}
          onClick={toggleRejectCalls}
        >
          <span className={styles.callSwitchThumb} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-8">
        <label htmlFor="call-rejection-message" className="text-sm font-medium text-zinc-200">Mensagem de resposta automática</label>
        <p className="mt-1 text-sm text-zinc-500">Enviada pelo WhatsApp logo após a chamada ser recusada.</p>
        <textarea
          id="call-rejection-message"
          value={msgCall}
          disabled={!rejectCall || saving}
          maxLength={1_000}
          rows={5}
          placeholder={saved.suggestedMessage}
          onChange={(event) => {
            setMsgCall(event.target.value);
            setError(null);
            setSuccess(false);
          }}
          className="mt-3 w-full resize-y rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:bg-white/[0.025] disabled:text-zinc-500"
        />
        <div className="mt-2 flex justify-between gap-4 text-xs text-zinc-600">
          <span>{!rejectCall ? "Ative a recusa para editar a mensagem." : invalidMessage ? "A mensagem é obrigatória quando a recusa está ativa." : ""}</span>
          <span>{msgCall.length}/1.000</span>
        </div>
      </div>

      {rejectCall && msgCall.trim() && (
        <div className="mt-6" aria-label="Prévia da mensagem">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-600">Prévia</span>
          <div className="mt-2 max-w-md rounded-2xl rounded-tl-md bg-[#202c33] px-4 py-3 text-sm leading-6 text-zinc-100 shadow-sm">
            {msgCall.trim()}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!dirty || saving || invalidMessage}
          onClick={() => void save()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {saving && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
        {dirty && !saving && <span className="text-xs text-amber-300/80">Alterações não salvas</span>}
        {success && !dirty && <span role="status" className="inline-flex items-center gap-1.5 text-sm text-emerald-300"><Check size={15} aria-hidden="true" /> Configuração salva</span>}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </section>
  );
}
