"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChartNoAxesColumnIncreasing, Check, LoaderCircle, RefreshCw, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPollResults, voteOnPoll } from "@/lib/chat-api";
import { socket } from "@/lib/socket";
import type { Poll, PollResults, PollVote } from "@/types/chat";

function voterLabel(vote: PollVote, ownIds: string[]) {
  if (ownIds.includes(vote.voterId)) return "Você";
  if (vote.voterName) return vote.voterName;
  return vote.voterId.endsWith("@s.whatsapp.net") ? `+${vote.voterId.split("@")[0]}` : "Participante do WhatsApp";
}

export function PollMessage({ poll, messageId }: { poll: Poll; messageId?: number }) {
  const [result, setResult] = useState<PollResults>({ poll, ownVoterIds: [] });
  const [pending, setPending] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const busy = useRef(false);
  const revision = useRef(0);
  const current = result.poll;
  const votes = current.votes ?? [];
  const activeVotes = votes.filter((vote) => vote.optionIndexes.length > 0);
  const ownVote = votes.find((vote) => result.ownVoterIds.includes(vote.voterId));
  const selected = pending ?? ownVote?.optionIndexes ?? [];

  useEffect(() => {
    if (!messageId) return;
    const controller = new AbortController();
    const before = revision.current;
    void getPollResults(messageId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult((previous) => before === revision.current ? data : { ...previous, ownVoterIds: data.ownVoterIds });
    }).catch(() => { if (!controller.signal.aborted) setError("Não foi possível atualizar os votos."); });
    function update(data: { messageId: number; poll: Poll }) {
      if (data.messageId !== messageId) return;
      revision.current += 1;
      setResult((previous) => ({ ...previous, poll: data.poll, syncError: null }));
    }
    socket.on("poll_updated", update);
    return () => { controller.abort(); socket.off("poll_updated", update); };
  }, [messageId]);

  async function castVote(index: number) {
    if (!messageId || busy.current) return;
    const next = selected.includes(index) ? selected.filter((value) => value !== index)
      : current.selectableCount === 1 ? [index] : [...selected, index];
    if (next.length > current.selectableCount) return;
    busy.current = true;
    setPending(next);
    setError(null);
    try { const data = await voteOnPoll(messageId, next); revision.current += 1; setResult(data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar seu voto."); }
    finally { busy.current = false; setPending(null); }
  }

  async function refresh() {
    if (!messageId || refreshing || busy.current) return;
    const before = revision.current;
    setRefreshing(true);
    setError(null);
    try { const data = await getPollResults(messageId); setResult((previous) => before === revision.current ? data : { ...previous, ownVoterIds: data.ownVoterIds }); }
    catch { setError("Não foi possível atualizar os votos."); }
    finally { setRefreshing(false); }
  }

  return <div className="w-64 max-w-full space-y-3 py-1">
    <div className="flex items-start gap-2"><ChartNoAxesColumnIncreasing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-400" /><p className="min-w-0 break-words text-sm font-semibold text-zinc-100">{current.question}</p></div>
    <p className="text-[11px] text-zinc-400">{current.selectableCount === 1 ? "Selecione uma opção" : "Selecione uma ou mais opções"}</p>
    <div className="space-y-2" role="group" aria-label="Opções da enquete">{current.options.map((option, index) => {
      const count = activeVotes.filter((vote) => vote.optionIndexes.includes(index)).length;
      const checked = selected.includes(index);
      return <button key={index} type="button" disabled={!messageId || pending !== null} aria-pressed={checked} aria-label={`Votar em ${option}`} onClick={() => void castVote(index)} className={`relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-colors enabled:hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-wait ${checked ? "border-emerald-400/40 bg-emerald-400/[0.06]" : "border-white/[0.08]"}`}>
        <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-white/[0.04] transition-[width]" style={{ width: `${activeVotes.length ? count / activeVotes.length * 100 : 0}%` }} />
        <span aria-hidden="true" className={`relative flex size-4 shrink-0 items-center justify-center border ${current.selectableCount === 1 ? "rounded-full" : "rounded"} ${checked ? "border-emerald-400 bg-emerald-500 text-black" : "border-zinc-500"}`}>{checked && <Check className="size-3" />}</span>
        <span className="relative min-w-0 flex-1 break-words text-xs text-zinc-200">{option}</span><span className="relative text-[11px] tabular-nums text-zinc-400">{count}</span>
      </button>;
    })}</div>
    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400"><span aria-live="polite">{pending !== null ? <span className="flex items-center gap-1.5"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />Enviando voto…</span> : `${activeVotes.length} ${activeVotes.length === 1 ? "participante" : "participantes"}`}</span><button type="button" onClick={() => void refresh()} disabled={refreshing || pending !== null || !messageId} aria-label="Atualizar votos" className="rounded p-1.5 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white/50"><RefreshCw className={`size-3 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} /></button></div>
    {(error || result.syncError) && <p role="alert" className="text-[11px] text-red-300">{error ?? result.syncError}</p>}
    <Dialog.Root open={resultsOpen} onOpenChange={(open) => { setResultsOpen(open); if (open) void refresh(); }}>
      <Dialog.Trigger className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white/50"><Users className="size-4" />Ver votos</Dialog.Trigger>
      <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" /><Dialog.Popup className="fixed top-1/2 left-1/2 z-[121] flex max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111] text-zinc-100 shadow-2xl outline-none">
        <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><Dialog.Title className="text-sm font-semibold">Votos da enquete</Dialog.Title><Dialog.Close aria-label="Fechar votos" className="rounded-full p-2 text-zinc-400 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white/50"><X className="size-4" /></Dialog.Close></header>
        <div className="min-h-0 overflow-y-auto px-5 py-4"><Dialog.Description className="mb-5 break-words text-sm text-zinc-300">{current.question}</Dialog.Description>
          {current.options.map((option, index) => {
            const people = activeVotes.filter((vote) => vote.optionIndexes.includes(index));
            return <section key={index} className="mb-5"><h3 className="mb-2 flex items-center justify-between gap-3 text-xs font-medium"><span className="break-words">{option}</span><span className="text-zinc-500">{people.length}</span></h3>{people.length ? <ul className="space-y-2">{people.map((vote) => <li key={vote.voterId} className="flex items-center gap-2.5 rounded-lg bg-white/[0.035] p-2.5"><span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] text-zinc-400">{voterLabel(vote, result.ownVoterIds).charAt(0).toLocaleUpperCase("pt-BR")}</span><span className="min-w-0 break-words text-xs text-zinc-300">{voterLabel(vote, result.ownVoterIds)}</span></li>)}</ul> : <p className="text-xs text-zinc-500">Nenhum voto nesta opção</p>}</section>;
          })}
        </div>
      </Dialog.Popup></Dialog.Portal>
    </Dialog.Root>
  </div>;
}
