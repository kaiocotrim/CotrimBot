"use client";

import { Languages, LoaderCircle, X } from "lucide-react";
import { MessageText } from "@/components/chat/message-text";
import type { MessageTranslationState } from "@/hooks/use-message-translations";

export function MessageTranslation({ translation, lightBackground, onHide, onRetry }: {
  translation?: MessageTranslationState;
  lightBackground?: boolean;
  onHide: () => void;
  onRetry: () => void;
}) {
  if (!translation?.visible) return null;
  return (
    <section aria-label="Tradução para português" className={`mt-2 border-t pt-2 ${lightBackground ? "border-zinc-300 text-zinc-800" : "border-white/15 text-zinc-100"}`}>
      <div className={`mb-1 flex items-center gap-1.5 text-[11px] ${lightBackground ? "text-zinc-600" : "text-zinc-400"}`}>
        <Languages className="size-3.5 shrink-0" aria-hidden="true" />
        <span>Tradução · Português</span>
        <button type="button" aria-label="Ocultar tradução" onClick={onHide} className="ml-auto rounded p-1 hover:bg-zinc-500/15 focus-visible:outline-2 focus-visible:outline-current"><X className="size-3" aria-hidden="true" /></button>
      </div>
      {translation.status === "loading" && <p role="status" className="flex items-center gap-1.5 text-xs"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />Traduzindo…</p>}
      {translation.status === "success" && <div lang="pt-BR" className="whitespace-pre-wrap break-words"><MessageText content={translation.text ?? ""} /></div>}
      {translation.status === "error" && <div role="alert" className={`text-xs ${lightBackground ? "text-red-700" : "text-red-300"}`}><p>{translation.error}</p><button type="button" onClick={onRetry} className="mt-1 underline underline-offset-2">Tentar novamente</button></div>}
    </section>
  );
}
