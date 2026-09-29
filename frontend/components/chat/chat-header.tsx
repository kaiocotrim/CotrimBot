"use client";

import { Info } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Contact } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";

type ChatHeaderProps = {
  contact: Contact;
  searchOpen: boolean;
  searchQuery: string;
  currentResult: number;
  resultCount: number;
  onOpenSearch: () => void;
  onOpenContactInfo: () => void;
  onSearchQueryChange: (value: string) => void;
  onPreviousResult: () => void;
  onNextResult: () => void;
  onCloseSearch: () => void;
};

const actionClass = "flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-35";

export function ChatHeader({ contact, searchOpen, searchQuery, currentResult, resultCount, onOpenSearch, onOpenContactInfo, onSearchQueryChange, onPreviousResult, onNextResult, onCloseSearch }: ChatHeaderProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  return (
    <header className="pointer-events-auto flex h-[64px] w-full items-center gap-3 border-b border-white/10 bg-zinc-950/55 px-4 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
      {searchOpen ? (
        <>
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3">
            <svg className="size-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input ref={searchRef} type="search" value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Localizar mensagem..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500" />
          </label>
          <span className="text-xs tabular-nums text-zinc-400">{resultCount ? currentResult + 1 : 0}/{resultCount}</span>
          <button type="button" onClick={onPreviousResult} disabled={!resultCount} aria-label="Resultado anterior" className={actionClass}>↑</button>
          <button type="button" onClick={onNextResult} disabled={!resultCount} aria-label="Próximo resultado" className={actionClass}>↓</button>
          <button type="button" onClick={onCloseSearch} aria-label="Fechar busca" className={actionClass}>✕</button>
        </>
      ) : (
        <>
          <button type="button" onClick={onOpenContactInfo} aria-label={`Abrir informações de ${contact.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-white/50">
            <Avatar contact={contact} className="size-10" />
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium">{contact.name}</span><span className="block truncate text-xs text-zinc-400">{contact.isGroup ? "Grupo do WhatsApp" : contact.phone}</span></span>
          </button>
          <div className="ml-auto flex h-11 items-center rounded-full border border-white/10 bg-white/[0.035] px-1">
            <button type="button" onClick={onOpenSearch} aria-label="Localizar mensagens" title="Localizar mensagens" className={actionClass}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg></button>
            <button
              type="button"
              onClick={onOpenContactInfo}
              aria-label="Informações do contato"
              title="Informações do contato"
              className={actionClass}
            >
              <Info className="size-5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </header>
  );
}
