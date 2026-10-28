"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, LoaderCircle, X } from "lucide-react";
import { TextMessage } from "@/components/chat/text-message";
import { splitMessageSignatures } from "@/lib/message-signature";
import type { Message } from "@/types/chat";

export function EditMessageDialog({ message, onSave, onClose }: {
  message: Message;
  onSave: (messageId: number, text: string) => Promise<void>;
  onClose: () => void;
}) {
  const originalBody = splitMessageSignatures(message.content).body;
  const prefix = message.content.slice(0, message.content.length - originalBody.length);
  const [text, setText] = useState(originalBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const changed = Boolean(text.trim()) && text.trim() !== originalBody.trim();

  async function save() {
    if (savingRef.current || !changed) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(message.id, prefix + text.trim());
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível editar a mensagem");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={open => { if (!open && !savingRef.current) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm" />
        <div className="pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-4">
          <Dialog.Popup initialFocus={inputRef} className="pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl outline-none">
            <div className="flex items-center gap-3 px-5 py-4">
              <button type="button" aria-label="Cancelar edição" disabled={saving} onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70 disabled:opacity-40"><X className="size-5" /></button>
              <Dialog.Title className="text-base font-medium">Editar mensagem</Dialog.Title>
            </div>
            <Dialog.Description className="sr-only">Altere o texto e confirme para atualizar a mensagem no WhatsApp.</Dialog.Description>
            <div className="flex min-h-40 max-h-[35dvh] items-center justify-end overflow-y-auto bg-black/40 px-8 py-8">
              <div className="max-w-[90%] whitespace-pre-wrap rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm [overflow-wrap:anywhere]">
                <TextMessage content={message.content} showSignature />
                <time className="mt-1 block text-right text-[10px] text-white/50" dateTime={message.createdAt}>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(message.createdAt))}</time>
              </div>
            </div>
            <form onSubmit={event => { event.preventDefault(); void save(); }} className="p-5">
              <div className="flex items-end gap-3 border-b-2 border-zinc-700 pb-2 focus-within:border-zinc-400">
                <textarea ref={inputRef} aria-label="Texto da mensagem" value={text} disabled={saving} rows={2} onChange={event => setText(event.target.value)} onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); }
                }} className="max-h-40 min-h-10 min-w-0 flex-1 resize-y bg-transparent py-2 text-sm outline-none disabled:opacity-60" />
                <button type="submit" aria-label="Salvar edição" disabled={saving || !changed} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-950 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:opacity-40">
                  {saving ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
                </button>
              </div>
              {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
            </form>
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
