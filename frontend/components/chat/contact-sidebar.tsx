"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/chat/avatar";
import { EmojiText } from "@/components/chat/emoji-text";
import { CompactScrollArea } from "@/components/ui/compact-scroll-area";
import type { Contact } from "@/types/chat";

type ContactSidebarProps = { contacts: Contact[]; loading: boolean; error: string | null; selectedContactId?: number; onSelectContact: (contact: Contact) => void; onArchiveContact: (contact: Contact, archived: boolean) => Promise<void> };
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

export function ContactSidebar({ contacts, loading, error, selectedContactId, onSelectContact, onArchiveContact }: ContactSidebarProps) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = contacts.filter((contact) => contact.archived).length;
  const visibleContacts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return contacts.filter((contact) => {
      if (contact.archived !== showArchived) return false;
      if (!search) return true;
      return contact.name.toLocaleLowerCase("pt-BR").includes(search)
        || contact.phone.includes(search)
        || Boolean(contact.messages?.[0]?.content.toLocaleLowerCase("pt-BR").includes(search));
    });
  }, [contacts, query, showArchived]);

  return (

      <div className="flex h-full min-h-0 w-[320px] min-w-[280px] max-w-[42vw] shrink-0 flex-col border-r border-white/[0.08]">
        <header className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-[23px] font-semibold leading-none tracking-tight text-zinc-50">CotrimBot</h1>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Mais opções"
                className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
              >
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Nova conversa"
                className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 transition-colors hover:bg-emerald-500/25 active:scale-95"
              >
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>

          <label className="mt-3 flex h-9 items-center gap-2 rounded-full border border-white/10 bg-gradient-to-b from-white/[0.075] via-white/[0.035] to-white/[0.015] px-3 text-zinc-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.16),inset_0_-1px_1px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur-2xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow,color] focus-within:border-white/20 focus-within:bg-zinc-900/65 focus-within:text-zinc-300 focus-within:ring-2 focus-within:ring-white/[0.05]">
            <svg className="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
              className="min-w-0 flex-1 bg-transparent text-[13px] font-normal text-zinc-100 outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            aria-pressed={showArchived}
            className={`mt-1.5 flex h-8 w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-[13px] transition-colors hover:bg-white/[0.04] hover:text-zinc-200 ${showArchived ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400"}`}
          >
            <svg className="size-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16v13H4zM3 4h18v3H3z" /><path d="M10 12h4" />
            </svg>
            <span className="flex-1">Arquivadas</span>
            {archivedCount > 0 && <span className="text-[11px] tabular-nums text-zinc-500">{archivedCount}</span>}
            <svg className={`size-3.5 text-zinc-600 transition-transform ${showArchived ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </header>

        <CompactScrollArea className="flex-1" label="Lista de conversas">
          <div className="px-2 pb-2">
            {visibleContacts.map((contact) => {
              const lastMessage = contact.messages?.[0];
              const selected = selectedContactId === contact.id;
              const unread = contact.unreadCount > 0;
              return (
                <div key={contact.id} className={`group relative rounded-xl transition-colors ${selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}>
                  <button type="button" onClick={() => onSelectContact(contact)} className="block w-full px-2 text-left">
                  <div className="flex items-center gap-2.5">
                    <Avatar contact={contact} />
                    <div className={`min-w-0 flex-1 py-2 ${selected ? "" : "border-b border-white/[0.05] group-hover:border-transparent"}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[14px] leading-tight font-medium tracking-[-0.01em] text-zinc-50">{contact.name}</p>
                        {lastMessage && (
                          <time dateTime={lastMessage.createdAt} className={`shrink-0 text-[11px] leading-tight ${unread ? "font-medium text-emerald-400" : "font-normal text-zinc-500"}`}>
                            {formatSidebarDate(lastMessage.createdAt)}
                          </time>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12px] leading-tight font-normal text-zinc-500">
                          <EmojiText content={lastMessage ? `${lastMessage.direction === "OUTGOING" ? "✓✓ " : ""}${lastMessage.content}` : "Nenhuma mensagem"} />
                        </p>
                         {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold text-zinc-950">
                            {contact.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onArchiveContact(contact, !contact.archived).catch((error) => console.error("Erro ao alterar arquivamento:", error))}
                    aria-label={contact.archived ? `Desarquivar ${contact.name}` : `Arquivar ${contact.name}`}
                    title={contact.archived ? "Desarquivar" : "Arquivar"}
                    className="absolute right-2 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-zinc-900/90 text-zinc-400 opacity-0 shadow-sm transition-[opacity,color,background-color] hover:bg-zinc-800 hover:text-zinc-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white/50 group-hover:opacity-100"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {contact.archived ? <path d="M4 7h16v13H4zM3 4h18v3H3zM12 17V10m-3 3 3-3 3 3" /> : <path d="M4 7h16v13H4zM3 4h18v3H3zM10 12h4" />}
                    </svg>
                  </button>
                </div>
              );
            })}
            {loading && <p className="px-4 py-10 text-center text-[13px] text-zinc-500">Carregando conversas...</p>}
            {!loading && error && <p role="alert" className="px-4 py-10 text-center text-[13px] text-red-300">{error}</p>}
            {!loading && !error && visibleContacts.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-zinc-500">{showArchived ? "Nenhuma conversa arquivada" : "Nenhuma conversa encontrada"}</p>}
          </div>
        </CompactScrollArea>
      </div>
  );
}
