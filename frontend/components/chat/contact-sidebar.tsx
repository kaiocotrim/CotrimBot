"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Avatar } from "@/components/chat/avatar";
import { EmojiText } from "@/components/chat/emoji-text";
import { QuickConversationPreview } from "@/components/chat/quick-conversation-preview";
import { CompactScrollArea } from "@/components/ui/compact-scroll-area";
import { authClient, useSession } from "@/lib/auth-client";
import { getMessages } from "@/lib/chat-api";
import type { Contact, Message } from "@/types/chat";

type ContactSidebarProps = { contacts: Contact[]; loading: boolean; error: string | null; selectedContactId?: number; onSelectContact: (contact: Contact) => void; onArchiveContact: (contact: Contact, archived: boolean) => Promise<void> };
type ConversationFilter = "conversations" | "groups";
const LONG_PRESS_DURATION = 1_000;
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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [query, setQuery] = useState("");
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("conversations");
  const [showArchived, setShowArchived] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [holdingContactId, setHoldingContactId] = useState<number | null>(null);
  const [completedContactId, setCompletedContactId] = useState<number | null>(null);
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);
  const [previewMessages, setPreviewMessages] = useState<Message[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressContactIdRef = useRef<number | null>(null);
  const suppressClickContactIdRef = useRef<number | null>(null);
  const previewRequestRef = useRef(0);
  const previewPanelRef = useRef<HTMLElement>(null);
  const archivedCount = contacts.filter((contact) => contact.archived).length;
  const visibleContacts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return contacts.filter((contact) => {
      if (contact.archived !== showArchived) return false;
      if (contact.isGroup !== (conversationFilter === "groups")) return false;
      if (!search) return true;
      return contact.name.toLocaleLowerCase("pt-BR").includes(search)
        || contact.phone.includes(search)
        || Boolean(contact.messages?.[0]?.content.toLocaleLowerCase("pt-BR").includes(search));
    });
  }, [contacts, conversationFilter, query, showArchived]);

  const closePreview = useCallback(() => {
    previewRequestRef.current += 1;
    setPreviewContact(null);
    setPreviewMessages([]);
    setPreviewLoading(false);
    setPreviewError(null);
  }, []);

  const openPreview = useCallback((contact: Contact) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewContact(contact);
    setPreviewMessages([]);
    setPreviewError(null);
    setPreviewLoading(true);

    void getMessages(contact.id, undefined, 5)
      .then((page) => {
        if (previewRequestRef.current !== requestId) return;
        setPreviewMessages(page.messages);
      })
      .catch((requestError: unknown) => {
        if (previewRequestRef.current !== requestId) return;
        setPreviewError(requestError instanceof Error ? requestError.message : "Não foi possível carregar a prévia");
      })
      .finally(() => {
        if (previewRequestRef.current === requestId) setPreviewLoading(false);
      });
  }, []);

  const cancelLongPress = useCallback((contactId?: number) => {
    if (contactId !== undefined && longPressContactIdRef.current !== contactId) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressContactIdRef.current = null;
    setHoldingContactId(null);
  }, []);

  function startLongPress(contact: Contact, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    cancelLongPress();
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    suppressClickContactIdRef.current = null;
    longPressContactIdRef.current = contact.id;
    setHoldingContactId(contact.id);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressContactIdRef.current = null;
      suppressClickContactIdRef.current = contact.id;
      setHoldingContactId(null);
      setCompletedContactId(contact.id);
      openPreview(contact);

      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      completionTimerRef.current = setTimeout(() => setCompletedContactId(null), 180);
    }, LONG_PRESS_DURATION);
  }

  function releaseLongPress(contactId: number) {
    cancelLongPress(contactId);
    if (suppressClickContactIdRef.current !== contactId) return;
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = setTimeout(() => {
      if (suppressClickContactIdRef.current === contactId) suppressClickContactIdRef.current = null;
    }, 0);
  }

  function selectContactFromClick(contact: Contact) {
    if (suppressClickContactIdRef.current === contact.id) {
      suppressClickContactIdRef.current = null;
      return;
    }
    onSelectContact(contact);
  }

  function openConversation(contact: Contact) {
    closePreview();
    onSelectContact(contact);
  }

  useEffect(() => {
    if (!previewContact) return;

    function handlePointerDown(event: PointerEvent) {
      if (!previewPanelRef.current?.contains(event.target as Node)) closePreview();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePreview();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePreview, previewContact]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    previewRequestRef.current += 1;
  }, []);

  return (

      <div className="relative flex h-full min-h-0 w-[320px] min-w-[280px] max-w-[42vw] shrink-0 flex-col border-r border-white/[0.08]">
        <header className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-[23px] font-semibold leading-none tracking-tight text-zinc-50">CotrimBot</h1>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  aria-label="Mais opções"
                  onClick={() => setShowMenu((current) => !current)}
                  className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
                >
                  <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute top-full left-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-xl">
                    {isAdmin && (
                      <Link
                        href="/admin"
                        className="flex w-full items-center px-3 py-2 text-left text-[13px] text-zinc-200 transition-colors hover:bg-white/[0.06]"
                      >
                        Usuários
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })}
                      className="flex w-full items-center px-3 py-2 text-left text-[13px] text-zinc-200 transition-colors hover:bg-white/[0.06]"
                    >
                      Sair
                    </button>
                  </div>
                )}
              </div>
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

          <div className="mt-1.5 grid grid-cols-2 gap-1" role="group" aria-label="Filtrar conversas">
            <button
              type="button"
              onClick={() => setConversationFilter("conversations")}
              aria-pressed={conversationFilter === "conversations"}
              className={`h-8 rounded-[10px] px-3 text-[13px] font-medium transition-colors ${conversationFilter === "conversations" ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"}`}
            >
              Conversas
            </button>
            <button
              type="button"
              onClick={() => setConversationFilter("groups")}
              aria-pressed={conversationFilter === "groups"}
              className={`h-8 rounded-[10px] px-3 text-[13px] font-medium transition-colors ${conversationFilter === "groups" ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"}`}
            >
              Grupos
            </button>
          </div>

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
                  <button
                    type="button"
                    onPointerDown={(event) => startLongPress(contact, event)}
                    onPointerUp={() => releaseLongPress(contact.id)}
                    onPointerLeave={() => releaseLongPress(contact.id)}
                    onPointerCancel={() => releaseLongPress(contact.id)}
                    onContextMenu={(event) => {
                      if (longPressContactIdRef.current === contact.id || suppressClickContactIdRef.current === contact.id) event.preventDefault();
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={() => selectContactFromClick(contact)}
                    className="block w-full select-none px-2 text-left"
                  >
                  <div className="flex items-center gap-2.5">
                    <span className={`relative shrink-0 transition-transform duration-150 ${completedContactId === contact.id ? "scale-[1.04]" : ""}`}>
                      <Avatar contact={contact} />
                      {holdingContactId === contact.id && (
                        <svg className="pointer-events-none absolute -inset-1 size-12 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
                          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/[0.08]" />
                          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="138.23" strokeDashoffset="138.23" className="text-emerald-400/75">
                            <animate attributeName="stroke-dashoffset" from="138.23" to="0" dur={`${LONG_PRESS_DURATION / 1_000}s`} fill="freeze" />
                          </circle>
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1 py-2">
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
            {!loading && !error && visibleContacts.length === 0 && (
              <p className="px-4 py-10 text-center text-[13px] text-zinc-500">
                {conversationFilter === "groups"
                  ? showArchived ? "Nenhum grupo arquivado" : "Nenhum grupo encontrado"
                  : showArchived ? "Nenhuma conversa arquivada" : "Nenhuma conversa encontrada"}
              </p>
            )}
          </div>
        </CompactScrollArea>
        <QuickConversationPreview
          contact={previewContact}
          messages={previewMessages}
          loading={previewLoading}
          error={previewError}
          panelRef={previewPanelRef}
          onClose={closePreview}
          onOpenConversation={openConversation}
        />
      </div>
  );
}
