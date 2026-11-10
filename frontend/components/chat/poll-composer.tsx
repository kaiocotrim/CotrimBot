"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ChartNoAxesColumnIncreasing, LoaderCircle, Plus, Send, Trash2, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { Poll } from "@/types/chat";

export function PollComposer({ onSend, onClose }: { onSend: (poll: Poll) => Promise<void>; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const values = options.map((option) => option.trim()).filter(Boolean);
  const duplicates = new Set(values.map((value) => value.toLocaleLowerCase("pt-BR"))).size !== values.length;
  const valid = Boolean(question.trim()) && values.length >= 2 && !duplicates;

  async function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSend({ question: question.trim(), options: values, selectableCount: multiple ? values.length : 1 });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a enquete.");
    } finally { inFlight.current = false; setSubmitting(false); }
  }

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" />
      <Dialog.Popup className="fixed top-1/2 left-1/2 z-[121] flex max-h-[calc(100dvh-32px)] w-[min(460px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111] text-zinc-100 shadow-2xl outline-none">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          <ChartNoAxesColumnIncreasing className="size-5 text-zinc-400" aria-hidden="true" />
          <Dialog.Title className="flex-1 text-sm font-semibold">Criar enquete</Dialog.Title>
          <Dialog.Close disabled={submitting} aria-label="Fechar enquete" className="flex size-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-40"><X className="size-4" /></Dialog.Close>
        </header>
        <Dialog.Description className="sr-only">Escreva uma pergunta e adicione de duas a doze opções de resposta.</Dialog.Description>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
          <fieldset disabled={submitting} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 disabled:opacity-60">
            <label className="block space-y-2"><span className="text-xs font-medium text-zinc-400">Pergunta</span><textarea autoFocus required rows={2} maxLength={255} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Faça uma pergunta" className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30" /></label>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-zinc-400">Opções</span><span className="text-zinc-600">Até 12 opções</span></div>
              <div className="space-y-2">{options.map((option, index) => <div key={index} className="flex items-center gap-2">
                <label className="min-w-0 flex-1"><span className="sr-only">Opção {index + 1}</span><input maxLength={100} value={option} onChange={(event) => setOptions((current) => current.map((value, position) => position === index ? event.target.value : value))} placeholder={`Opção ${index + 1}`} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30" /></label>
                {options.length > 2 && <button type="button" aria-label={`Remover opção ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, position) => position !== index))} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-white/50"><Trash2 className="size-4" /></button>}
              </div>)}</div>
              {duplicates && <p role="alert" className="mt-2 text-xs text-red-300">Use opções de resposta diferentes.</p>}
              {options.length < 12 && <button type="button" onClick={() => setOptions((current) => [...current, ""])} className="mt-3 flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-zinc-300 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white/50"><Plus className="size-4" />Adicionar opção</button>}
            </div>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-t border-white/[0.07] pt-4 text-xs text-zinc-300">Permitir várias respostas<input type="checkbox" checked={multiple} onChange={(event) => setMultiple(event.target.checked)} className="size-4 accent-emerald-500" /></label>
          </fieldset>
          {error && <p role="alert" className="px-5 pb-4 text-xs text-red-300">{error}</p>}
          <footer className="flex shrink-0 justify-end border-t border-white/[0.07] px-5 py-4"><button type="submit" disabled={!valid || submitting} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600/80 px-4 text-xs font-medium text-white transition hover:bg-emerald-500/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500">{submitting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Send className="size-4" />}{submitting ? "Enviando…" : "Enviar enquete"}</button></footer>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
