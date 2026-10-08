"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Avatar } from "@/components/chat/avatar";
import { AccountSettings } from "@/components/chat/account-settings";
import { MessageText } from "@/components/chat/message-text";
import { QuickConversationPreview } from "@/components/chat/quick-conversation-preview";
import { CompactScrollArea } from "@/components/ui/compact-scroll-area";
import { useSession } from "@/lib/auth-client";
import { getMessages } from "@/lib/chat-api";
import type { Contact, Message } from "@/types/chat";

type ContactSidebarProps = { userId: string; contacts: Contact[]; loading: boolean; error: string | null; selectedContactId?: number; onSelectContact: (contact: Contact) => void };
type ConversationFilter = "conversations" | "groups" | "mine";
const PREVIEW_HOLD_DURATION = 1_000;
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

export function ContactSidebar({ userId, contacts, loading, error, selectedContactId, onSelectContact }: ContactSidebarProps) {
  const { data: session } = useSession();
  const userImage = session?.user?.image;
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("conversations");
  const [showArchived, setShowArchived] = useState(false);
  const [holdingContactId, setHoldingContactId] = useState<number | null>(null);
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);
  const [previewMessages, setPreviewMessages] = useState<Message[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const holdingContactIdRef = useRef<number | null>(null);
  const previewRequestRef = useRef(0);
  const previewPanelRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const archivedCount = contacts.filter((contact) => contact.archived).length;
  const visibleContacts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return contacts.filter((contact) => {
      if (contact.archived !== showArchived) return false;
      if (contact.isGroup !== (conversationFilter === "groups")) return false;
      if (conversationFilter === "mine" && contact.assignedUserId !== userId) return false;
      if (!search) return true;
      return contact.name.toLocaleLowerCase("pt-BR").includes(search)
        || contact.phone.includes(search)
        || Boolean(contact.messages?.[0]?.content.toLocaleLowerCase("pt-BR").includes(search));
    });
  }, [contacts, conversationFilter, query, showArchived, userId]);

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

  const cancelPreviewHold = useCallback((contactId?: number) => {
    if (contactId !== undefined && holdingContactIdRef.current !== contactId) return;
    holdingContactIdRef.current = null;
    setHoldingContactId(null);
  }, []);

  function startPreviewHold(contact: Contact, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 2) return;
    cancelPreviewHold();
    holdingContactIdRef.current = contact.id;
    setHoldingContactId(contact.id);
  }

  function completePreviewHold(contact: Contact) {
    if (holdingContactIdRef.current !== contact.id) return;
    // A própria animação controla a espera e mantém o círculo completo até soltar.
    openPreview(contact);
  }

  function selectContactFromClick(contact: Contact, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.detail > 1) return;
    openConversation(contact);
  }

  function openConversation(contact: Contact) {
    cancelPreviewHold();
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

  useEffect(() => {
    function handleMouseUp(event: MouseEvent) {
      if (event.button === 2) cancelPreviewHold();
    }

    function handleBlur() {
      cancelPreviewHold();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancelPreviewHold();
    }

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("keydown", handleKeyDown);
      holdingContactIdRef.current = null;
      previewRequestRef.current += 1;
    };
  }, [cancelPreviewHold]);

  useEffect(() => {
    function handleSidebarShortcut(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing || event.key.toLowerCase() !== "b") return;
      if (document.activeElement?.closest('[role="dialog"]')) return;
      event.preventDefault();
      if (event.repeat) return;

      if (headerRef.current?.contains(document.activeElement)) sidebarRef.current?.focus();
      cancelPreviewHold();
      closePreview();
      setIsCollapsed((current) => !current);
    }

    window.addEventListener("keydown", handleSidebarShortcut);
    return () => window.removeEventListener("keydown", handleSidebarShortcut);
  }, [cancelPreviewHold, closePreview]);

  const emptyMessage = conversationFilter === "groups"
    ? showArchived ? "Nenhum grupo arquivado" : "Nenhum grupo encontrado"
    : conversationFilter === "mine"
      ? showArchived ? "Nenhuma conversa sua arquivada" : "Nenhuma conversa atribuída a você. Assuma uma conversa na aba Conversas."
      : showArchived ? "Nenhuma conversa arquivada" : "Nenhuma conversa encontrada";

  return (

      <aside
        ref={sidebarRef}
        tabIndex={-1}
        aria-label="Barra lateral de conversas"
        aria-keyshortcuts="Control+b"
        className={`relative flex h-full min-h-0 shrink-0 flex-col border-r border-white/[0.08] outline-none transition-[width,min-width,max-width] duration-200 motion-reduce:transition-none ${isCollapsed ? "w-20 min-w-20 max-w-20" : "w-[320px] min-w-[280px] max-w-[42vw]"}`}
      >
        <header ref={headerRef} hidden={isCollapsed} className="px-4 pt-4 pb-2">
          <h1 className="sr-only">CotrimBot</h1>
          <div className="flex items-center justify-between">
            {session?.user && (
              <AccountSettings user={session.user} onOpen={() => {
                cancelPreviewHold();
                closePreview();
              }}>
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-800 text-zinc-400"
                >
                  {userImage && userImage !== failedAvatarUrl ? (
                    // A foto da sessão pode vir de uma URL externa e dinâmica.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userImage}
                      alt=""
                      className="size-full object-cover"
                      onError={() => setFailedAvatarUrl(userImage)}
                    />
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-6">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                    </svg>
                  )}
                </span>
              </AccountSettings>
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Nova conversa"
                className="flex size-8 items-center justify-center rounded-full bg-zinc-950 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
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

          <div className="mt-1.5 grid grid-cols-3 gap-1" role="group" aria-label="Filtrar conversas">
            <button
              type="button"
              onClick={() => setConversationFilter("conversations")}
              aria-pressed={conversationFilter === "conversations"}
              className={`h-8 rounded-[10px] px-2 text-[13px] font-medium transition-colors ${conversationFilter === "conversations" ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"}`}
            >
              Conversas
            </button>
            <button
              type="button"
              onClick={() => setConversationFilter("groups")}
              aria-pressed={conversationFilter === "groups"}
              className={`h-8 rounded-[10px] px-2 text-[13px] font-medium transition-colors ${conversationFilter === "groups" ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"}`}
            >
              Grupos
            </button>
            <button
              type="button"
              onClick={() => setConversationFilter("mine")}
              aria-pressed={conversationFilter === "mine"}
              className={`h-8 rounded-[10px] px-2 text-[13px] font-medium transition-colors ${conversationFilter === "mine" ? "bg-white/[0.07] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"}`}
            >
              Minhas
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
          <div className={isCollapsed ? "space-y-1 py-3 pr-1 pl-3" : "px-2 pb-2"}>
            {visibleContacts.map((contact) => {
              const lastMessage = contact.messages?.[0];
              const selected = selectedContactId === contact.id;
              const unread = contact.unreadCount > 0;
              return (
                <div key={contact.id} className={`group relative rounded-xl transition-colors ${selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => startPreviewHold(contact, event)}
                    onMouseLeave={() => cancelPreviewHold(contact.id)}
                    onPointerCancel={() => cancelPreviewHold(contact.id)}
                    onContextMenu={(event) => {
                      if (event.button !== 2) return;
                      event.preventDefault();
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => selectContactFromClick(contact, event)}
                    aria-label={`${contact.name}${unread ? `, ${contact.unreadCount} mensagens não lidas` : ""}`}
                    aria-current={selected ? "true" : undefined}
                    title={`${contact.name} — Clique para abrir a conversa; segure o botão direito por 1 segundo para ver a prévia`}
                    className={`block w-full select-none text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 ${isCollapsed ? "rounded-xl py-2" : "px-2"}`}
                  >
                  <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-2.5"}`}>
                    <span className="relative shrink-0">
                      <Avatar contact={contact} />
                      {holdingContactId === contact.id && (
                        <svg className="pointer-events-none absolute -inset-1 size-12 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
                          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20" />
                          <circle
                            cx="24"
                            cy="24"
                            r="22"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            pathLength="100"
                            strokeDasharray="100"
                            strokeDashoffset="100"
                            className="text-white"
                            style={{ animation: `conversation-preview-hold ${PREVIEW_HOLD_DURATION}ms linear forwards` }}
                            onAnimationEnd={() => completePreviewHold(contact)}
                          />
                        </svg>
                      )}
                    </span>
                    <div className={isCollapsed ? "hidden" : "min-w-0 flex-1 py-2"}>
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
                          {lastMessage && !lastMessage.deletedAt && lastMessage.direction === "OUTGOING" && "✓✓ "}
                          <MessageText content={lastMessage ? lastMessage.deletedAt ? "Mensagem apagada" : lastMessage.content : "Nenhuma mensagem"} showSignature={Boolean(lastMessage && !lastMessage.deletedAt && !lastMessage.private && lastMessage.direction === "OUTGOING")} linkify={false} />
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
                </div>
              );
            })}
            {loading && (
              <p role="status" title="Carregando conversas..." className={`py-10 text-center text-[13px] text-zinc-500 ${isCollapsed ? "flex justify-center" : "px-4"}`}>
                {isCollapsed && <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 motion-reduce:animate-none" />}
                <span className={isCollapsed ? "sr-only" : undefined}>Carregando conversas...</span>
              </p>
            )}
            {!loading && error && (
              <p role="alert" title={error} className={`py-10 text-center text-[13px] text-red-300 ${isCollapsed ? "flex justify-center" : "px-4"}`}>
                {isCollapsed && <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full border border-current">!</span>}
                <span className={isCollapsed ? "sr-only" : undefined}>{error}</span>
              </p>
            )}
            {!loading && !error && visibleContacts.length === 0 && (
              <p title={emptyMessage} className={`py-10 text-center text-[13px] text-zinc-500 ${isCollapsed ? "flex justify-center" : "px-4"}`}>
                {isCollapsed && (
                  <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
                  </svg>
                )}
                <span className={isCollapsed ? "sr-only" : undefined}>{emptyMessage}</span>
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
          onOpenConversation={openConversation}
        />
      </aside>
  );
}
