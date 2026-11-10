"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LogOut, RefreshCw, Smartphone } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type ConnectionInfo = {
  instance: string;
  state: string;
  connected: boolean;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(body?.message ?? "Não foi possível acessar a Evolution API.");
  return body as T;
}

export function EvolutionConnectionSettings() {
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingQr, setRefreshingQr] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQrCode = useCallback(async () => {
    setRefreshingQr(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/evolution/qrcode`, { credentials: "include", cache: "no-store" });
      const data = await readJson<{ qrCode: string | null; pairingCode: string | null }>(response);
      setQrCode(data.qrCode);
      setPairingCode(data.pairingCode);
      if (!data.qrCode && !data.pairingCode) setError("A Evolution não retornou um QR Code. Tente atualizar novamente.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível gerar o QR Code.");
    } finally {
      setRefreshingQr(false);
    }
  }, []);

  const loadConnection = useCallback(async (loadQrWhenDisconnected = false) => {
    try {
      const response = await fetch(`${API_URL}/evolution/connection`, { credentials: "include", cache: "no-store" });
      const data = await readJson<ConnectionInfo>(response);
      setConnection(data);
      setError(null);
      if (data.connected) {
        setQrCode(null);
        setPairingCode(null);
      } else if (loadQrWhenDisconnected) {
        await loadQrCode();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível consultar a conexão.");
    } finally {
      setLoading(false);
    }
  }, [loadQrCode]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadConnection(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadConnection]);

  useEffect(() => {
    if (connection?.connected) return;
    const interval = window.setInterval(() => void loadConnection(false), 5_000);
    return () => window.clearInterval(interval);
  }, [connection?.connected, loadConnection]);

  async function disconnect() {
    if (disconnecting || !window.confirm("Encerrar a conexão atual do WhatsApp? Será necessário escanear um novo QR Code para conectar novamente.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/evolution/connection`, { method: "DELETE", credentials: "include" });
      await readJson<{ disconnected: boolean }>(response);
      setConnection((current) => current ? { ...current, state: "close", connected: false } : current);
      await loadQrCode();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível encerrar a conexão.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 text-sm text-zinc-400"><RefreshCw size={17} className="animate-spin" /> Consultando WhatsApp...</div>;
  }

  if (connection?.connected) {
    return (
      <section className="px-1 py-3">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white"><CheckCircle2 size={23} /></span>
            <div className="min-w-0"><h3 className="text-lg font-semibold text-white">WhatsApp conectado</h3><p className="mt-1 text-sm text-zinc-400">A instância <strong className="font-medium text-zinc-200">{connection.instance}</strong> está pronta para enviar e receber mensagens.</p></div>
          </div>
          <button type="button" disabled={disconnecting} onClick={() => void disconnect()} className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50 sm:ml-auto sm:self-center"><LogOut size={15} />{disconnecting ? "Encerrando..." : "Encerrar conexão"}</button>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-7">
      <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300"><Smartphone size={22} /></span><div><h3 className="text-lg font-semibold text-zinc-100">Conectar WhatsApp</h3><p className="mt-1 max-w-lg text-sm leading-6 text-zinc-400">No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho e escaneie o código abaixo.</p></div></div>

      <div className="mt-6 flex flex-col items-center rounded-2xl border border-white/[0.08] bg-black p-5">
        {qrCode ? (
          <div className="rounded-2xl bg-white p-3 shadow-[0_14px_45px_rgba(0,0,0,0.35)]">
            {/* QR dinâmico fornecido pela instância privada da Evolution API. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="QR Code para conectar o WhatsApp" className="size-56" />
          </div>
        ) : pairingCode ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-8 py-5 text-center"><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Código de pareamento</p><p className="mt-2 text-2xl font-semibold tracking-[0.2em] text-zinc-100">{pairingCode}</p></div>
        ) : (
          <div className="flex size-56 items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-sm text-zinc-500">QR Code indisponível</div>
        )}
        <button type="button" disabled={refreshingQr} onClick={() => void loadQrCode()} className="mt-4 flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"><RefreshCw size={15} className={refreshingQr ? "animate-spin" : ""} />{refreshingQr ? "Atualizando..." : "Atualizar QR Code"}</button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </section>
  );
}
