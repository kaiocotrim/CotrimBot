"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/chat/avatar";
import { EmojiText } from "@/components/chat/emoji-text";
import { CompactScrollArea } from "@/components/ui/compact-scroll-area";
import type { Contact } from "@/types/chat";

type ContactSidebarProps = { contacts: Contact[]; selectedContactId?: number; onSelectContact: (contact: Contact) => void };
const CHAT_TIME_ZONE = "America/Sao_Paulo";
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: CHAT_TIME_ZONE });
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: CHAT_TIME_ZONE });
const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: CHAT_TIME_ZONE });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: CHAT_TIME_ZONE });

function formatSidebarDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const key = dayKeyFormatter.format(date);
  if (key === dayKeyFormatter.format(today)) return timeFormatter.format(date);
  if (key === dayKeyFormatter.format(yesterday)) return "Ontem";
  if (today.getTime() - date.getTime() < 6 * 86_400_000) return weekdayFormatter.format(date);
  return dateFormatter.format(date);
}

export function ContactSidebar({ contacts, selectedContactId, onSelectContact }: ContactSidebarProps) {
  const [query, setQuery] = useState("");
  const visibleContacts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return contacts.filter((contact) => {
      if (!search) return true;
      return contact.name.toLocaleLowerCase("pt-BR").includes(search)
        || contact.phone.includes(search)
        || Boolean(contact.messages?.[0]?.content.toLocaleLowerCase("pt-BR").includes(search));
    });
  }, [contacts, query]);

  return (
    <aside className="flex h-full min-h-0 shrink-0 bg-zinc-950">
      <nav className="flex w-12 shrink-0 flex-col items-center bg-zinc-900/95 py-2" aria-label="Navegação principal">
        <div className="mt-auto flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-900 text-[10px] font-semibold text-white" title="Perfil" aria-label="Perfil">CB</div>
      </nav>

      <div className="flex h-full min-h-0 w-[360px] min-w-[300px] max-w-[42vw] flex-col">
      <div className="px-4 pt-3 pb-2">
        <div className="flex h-9 items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">CotrimBot</h1>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Mais opções" className="flex size-8 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white">
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
            </button>
            <button type="button" aria-label="Nova conversa" className="flex size-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        </div>

        <label className="mt-2 flex h-9 items-center gap-2.5 rounded-full bg-zinc-900 px-3 text-zinc-400 focus-within:ring-1 focus-within:ring-white/20">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar ou começar uma nova conversa" className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-400" />
        </label>

        <button type="button" className="mt-2 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-xs text-zinc-300 transition-colors hover:bg-white/[0.05]">
          <svg className="size-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3z" /><path d="M9 12h6M12 9v6" /></svg>
          <span className="flex-1">Arquivadas</span>
        </button>
      </div>

      <CompactScrollArea className="flex-1" label="Lista de conversas">
        <div className="space-y-0.5 px-2 pb-2">
          {visibleContacts.map((contact) => {
            const lastMessage = contact.messages?.[0];
            const selected = selectedContactId === contact.id;
            return (
              <button key={contact.id} type="button" onClick={() => onSelectContact(contact)} className={`w-full rounded-xl px-2.5 py-2 text-left transition-colors ${selected ? "bg-zinc-900" : "hover:bg-zinc-900/70"}`}>
                <div className="flex items-center gap-3">
                  <Avatar contact={contact} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[13px] font-medium text-zinc-100">{contact.name}</p>
                      {lastMessage && <time dateTime={lastMessage.createdAt} className="shrink-0 text-[9px] text-zinc-400">{formatSidebarDate(lastMessage.createdAt)}</time>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[11px] leading-4 text-zinc-400"><EmojiText content={lastMessage ? `${lastMessage.direction === "OUTGOING" ? "✓✓ " : ""}${lastMessage.content}` : "Nenhuma mensagem"} /></p>
                      {contact.unreadCount > 0 && <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-semibold text-zinc-950">{contact.unreadCount}</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {visibleContacts.length === 0 && <p className="px-4 py-8 text-center text-xs text-zinc-500">Nenhuma conversa encontrada</p>}
        </div>
      </CompactScrollArea>
      </div>
    </aside>
  );
}
