"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pin, Search, Send, Star, Trash2, X } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { Avatar } from "@/components/chat/avatar";
import { ChatHeader, SidebarMenuButton } from "@/components/chat/chat-header";
import { EmptyChatAnimation } from "@/components/chat/empty-chat-animation";
import { ContactInfoPanel } from "@/components/chat/contact-info-panel";
import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import { getFavoriteMessages, type GroupParticipant } from "@/lib/chat-api";
import type { Contact, ContactPresence, Message, Poll } from "@/types/chat";

type ChatPanelProps = {
  userId: string;
  currentUser: { id: string; name: string; image?: string | null };
  contact: Contact | null;
  contacts: Contact[];
  messages: Message[];
  text: string;
  sending: boolean;
  closing: boolean;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  newMessageId: number | null;
  isTyping: boolean;
  contactPresence?: ContactPresence | null;

  onTextChange: (text: string) => void;
  onSend: (options: { private: boolean; includeSignature: boolean; replyToMessageId?: number; mentionedUserIds?: string[] }) => void;
  onLoadOlderMessages: () => Promise<void>;
  onEnsureMessageLoaded: (messageId: number) => Promise<boolean>;
  onReactToMessage: (messageId: number, reaction: string) => Promise<void>;
  onUpdateMessageFlags: (messageId: number, flags: { pinned?: boolean; pinDurationHours?: 24 | 168 | 720; favorited?: boolean }) => Promise<void>;
  onDeleteMessage: (messageId: number, scope: "me" | "everyone") => Promise<void>;
  onForwardMessage: (message: Message, target: Contact) => void;

  // Envia arquivos + legenda opcional.
  onSendMedia: (
    files: File[],
    caption?: string,
    replyToMessageId?: number,
    includeSignature?: boolean,
  ) => Promise<void>;

  onCloseWithBot: () => void;
  onSendPoll: (poll: Poll) => Promise<void>;
  onSelectContact: (contact: Contact) => void;
  onSaveContact: (name: string, phone: string, companyName: string, jobTitle?: string) => Promise<Contact[]>;
  onSaveSharedContact: (name: string, phone: string) => Promise<void>;
  onMessageSharedContact: (name: string, phone: string) => Promise<void>;
  onRenameContact: (contactId: number, name: string, companyName?: string, jobTitle?: string, phone?: string) => Promise<void>;
  onSetContactAssignment: (contactId: number, assignedUserIds: string[]) => Promise<void>;
  onSetContactPriority: (contactId: number, priority: NonNullable<Contact["priority"]>) => Promise<void>;
  onOpenSidebar: () => void;
  sidebarOpen: boolean;
};

// Agrupa todas as partes visuais da conversa selecionada.
export function ChatPanel({
  userId,
  currentUser,
  contact,
  contacts,
  messages,
  text,
  sending,
  closing,
  hasOlderMessages,
  loadingOlderMessages,
  newMessageId,
  isTyping,
  contactPresence,
  onTextChange,
  onSend,
  onLoadOlderMessages,
  onEnsureMessageLoaded,
  onReactToMessage,
  onUpdateMessageFlags,
  onDeleteMessage,
  onForwardMessage,
  onSendMedia,
  onSendPoll,
  onCloseWithBot,
  onSelectContact,
  onSaveContact,
  onSaveSharedContact,
  onMessageSharedContact,
  onRenameContact,
  onSetContactAssignment,
  onSetContactPriority,
  onOpenSidebar,
  sidebarOpen,
}: ChatPanelProps) {
  const [conversationPanel, setConversationPanel] = useState<HTMLElement | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(() => new Set());
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [deleteSelectionOpen, setDeleteSelectionOpen] = useState(false);
  const [deleteSelectionError, setDeleteSelectionError] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardTargetIds, setForwardTargetIds] = useState<Set<number>>(() => new Set());
  const [forwardingMessages, setForwardingMessages] = useState<Message[]>([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteMessages, setFavoriteMessages] = useState<Message[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("pt-BR");
    return query ? messages.filter((message) => message.content.toLocaleLowerCase("pt-BR").includes(query)) : [];
  }, [messages, searchQuery]);
  const normalizedSearchIndex = searchResults.length
    ? Math.min(searchIndex, searchResults.length - 1)
    : 0;
  const highlightedMessageId = searchResults[normalizedSearchIndex]?.id ?? null;
  const pinnedMessage = useMemo(() => messages.findLast((message) => (
    message.pinned && (!message.pinnedUntil || new Date(message.pinnedUntil).getTime() > Date.now())
  )) ?? null, [messages]);
  const showPinnedMessage = Boolean(pinnedMessage && !searchOpen && !selectionMode);
  const forwardTargets = useMemo(() => {
    const query = forwardQuery.trim().toLocaleLowerCase("pt-BR");
    const savedContacts = contacts.filter((item) => item.isSaved && !item.isGroup);
    if (!query) return savedContacts;
    return savedContacts.filter((item) => `${item.name} ${item.phone} ${item.companyName ?? ""} ${item.jobTitle ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [contacts, forwardQuery]);
  const activeReply = replyingTo?.contactId === contact?.id ? replyingTo : null;

  function replyToMessage(message: Message) {
    setReplyingTo(message);
    setComposerFocusKey((current) => current + 1);
  }

  function startSelection() {
    setContactInfoOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
    setReplyingTo(null);
    setSelectedMessageIds(new Set());
    setSelectionMode(true);
  }

  function closeSelection() {
    setDeleteSelectionOpen(false);
    setDeleteSelectionError(null);
    setForwardOpen(false);
    setForwardQuery("");
    setForwardTargetIds(new Set());
    setForwardingMessages([]);
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }

  async function favoriteSelectedMessages() {
    const selected = messages.filter((message) => selectedMessageIds.has(message.id));
    if (!selected.length || selectionBusy) return;
    setSelectionBusy(true);
    try {
      await Promise.all(selected.map((message) => onUpdateMessageFlags(message.id, { favorited: true })));
      closeSelection();
    } finally {
      setSelectionBusy(false);
    }
  }

  async function deleteSelectedMessages(scope: "me" | "everyone") {
    const selected = messages.filter((message) => selectedMessageIds.has(message.id));
    if (!selected.length || selectionBusy) return;
    setSelectionBusy(true);
    setDeleteSelectionError(null);
    try {
      await Promise.all(selected.map((message) => onDeleteMessage(message.id, scope)));
      closeSelection();
    } catch (error) {
      setDeleteSelectionError(error instanceof Error ? error.message : "Não foi possível apagar as mensagens.");
    } finally {
      setSelectionBusy(false);
    }
  }

  function forwardSelectedMessages() {
    const targets = contacts.filter((item) => forwardTargetIds.has(item.id));
    targets.forEach((target) => forwardingMessages.forEach((message) => onForwardMessage(message, target)));
    closeSelection();
  }

  function openForwardPanel(messagesToForward: Message[]) {
    if (!messagesToForward.length) return;
    setForwardingMessages(messagesToForward);
    setForwardQuery("");
    setForwardTargetIds(new Set());
    setForwardOpen(true);
  }

  function toggleForwardTarget(contactId: number) {
    setForwardTargetIds((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  async function openFavoriteMessages() {
    if (!contact) return;
    setFavoritesOpen(true);
    setFavoritesLoading(true);
    setFavoritesError(null);
    try {
      setFavoriteMessages(await getFavoriteMessages(contact.id));
    } catch (error) {
      setFavoritesError(error instanceof Error ? error.message : "Não foi possível carregar as mensagens favoritas.");
    } finally {
      setFavoritesLoading(false);
    }
  }

  async function goToFavoriteMessage(messageId: number) {
    const available = messages.some((message) => message.id === messageId) || await onEnsureMessageLoaded(messageId);
    if (!available) return;
    setFavoritesOpen(false);
    window.setTimeout(() => {
      document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  function toggleMessageSelection(messageId: number) {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  async function startParticipantConversation(participant: GroupParticipant) {
    const target = contacts.find((item) => !item.isGroup && item.phone.replace(/\D/g, "") === participant.phone);
    if (target) {
      setContactInfoOpen(false);
      onSelectContact(target);
      return;
    }

    await onSaveContact(participant.name ?? `+${participant.phone}`, participant.phone, "");
    setContactInfoOpen(false);
  }

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLocaleLowerCase("pt-BR") === "f") {
        event.preventDefault();
        setSelectionMode(false);
        setSelectedMessageIds(new Set());
        setContactInfoOpen(false);
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        setSearchQuery("");
        return;
      }
      if (event.key === "Escape" && favoritesOpen) {
        event.preventDefault();
        setFavoritesOpen(false);
        return;
      }
      if (event.key === "Escape" && forwardOpen) {
        event.preventDefault();
        setForwardOpen(false);
        return;
      }
      if (event.key === "Escape" && selectionMode) {
        event.preventDefault();
        closeSelection();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [favoritesOpen, forwardOpen, searchOpen, selectionMode]);

  useEffect(() => {
    if (highlightedMessageId === null) return;
    document.getElementById(`message-${highlightedMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedMessageId]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setFavoritesOpen(false);
    setFavoriteMessages([]);
  }, [contact?.id]);

  if (!contact) {
    return (
      <section className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-zinc-500">
        <SidebarMenuButton onClick={onOpenSidebar} expanded={sidebarOpen} className="absolute top-3 left-3" />
        <EmptyChatAnimation />
        <p>Selecione um contato para iniciar</p>
      </section>
    );
  }

  return (
    <section className="@container relative flex min-h-0 min-w-0 flex-1 overflow-hidden max-lg:bg-[#050506] max-lg:[--chat-message-top-gap:12px]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col @min-[640px]:flex-row">
        <div ref={setConversationPanel} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Papel de parede fornecido pelo usuário via Unsplash. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat lg:block"
            style={{ backgroundImage: "url('/mesh-gradient2.png')" }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden bg-zinc-950/50 lg:block" />

          <div data-chat-header className="pointer-events-none absolute inset-x-0 top-0 z-20 max-lg:relative max-lg:shrink-0">
            <ChatHeader
              key={contact.id}
              contact={contact}
              currentUserId={userId}
              onSetContactAssignment={onSetContactAssignment}
              isTyping={isTyping}
              contactPresence={contactPresence}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              currentResult={normalizedSearchIndex}
              resultCount={searchResults.length}
              selectionMode={selectionMode}
              selectedCount={selectedMessageIds.size}
              selectionBusy={selectionBusy}
              onOpenSearch={() => { setContactInfoOpen(false); setSearchOpen(true); }}
              onOpenFavorites={() => { setContactInfoOpen(false); void openFavoriteMessages(); }}
              onStartSelection={startSelection}
              onCloseSelection={closeSelection}
              onFavoriteSelected={() => void favoriteSelectedMessages()}
              onDeleteSelected={() => { setDeleteSelectionError(null); setDeleteSelectionOpen(true); }}
              onOpenForward={() => openForwardPanel(messages.filter((message) => selectedMessageIds.has(message.id)))}
              onOpenContactInfo={() => setContactInfoOpen(true)}
              onSearchQueryChange={(value) => { setSearchQuery(value); setSearchIndex(0); }}
              onPreviousResult={() => setSearchIndex((current) => searchResults.length ? (current - 1 + searchResults.length) % searchResults.length : 0)}
              onNextResult={() => setSearchIndex((current) => searchResults.length ? (current + 1) % searchResults.length : 0)}
              onCloseSearch={() => { setSearchOpen(false); setSearchQuery(""); }}
              onOpenSidebar={onOpenSidebar}
              sidebarOpen={sidebarOpen}
            />
            <AnimatePresence initial={false}>
              {showPinnedMessage && pinnedMessage && (
                <motion.div
                  key={pinnedMessage.id}
                  initial={{ opacity: 0, y: -7 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-auto mx-2 mt-1 flex h-12 items-center overflow-hidden rounded-xl border border-white/10 bg-zinc-950/90 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:mx-4"
                >
                  <button
                    type="button"
                    onClick={() => document.getElementById(`message-${pinnedMessage.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 text-left focus-visible:outline-2 focus-visible:outline-white/50"
                  >
                    <span className="h-7 w-0.5 shrink-0 rounded-full bg-zinc-300" />
                    <Pin className="size-4 shrink-0 text-zinc-400" strokeWidth={1.8} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-[11px] font-medium text-zinc-300">Mensagem fixada</strong>
                      <span className="block truncate text-xs text-zinc-500">{pinnedMessage.content || "Mídia"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateMessageFlags(pinnedMessage.id, { pinned: false })}
                    aria-label="Desafixar mensagem"
                    title="Desafixar mensagem"
                    className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <MessageList
            currentUser={currentUser}
            contact={contact}
            contacts={contacts}
            messages={messages}
            hasOlderMessages={hasOlderMessages}
            loadingOlderMessages={loadingOlderMessages}
            newMessageId={newMessageId}
            highlightedMessageId={highlightedMessageId}
            hasPinnedMessage={showPinnedMessage}
            selectionMode={selectionMode}
            selectedMessageIds={selectedMessageIds}
            onLoadOlderMessages={onLoadOlderMessages}
            onReactToMessage={onReactToMessage}
            onUpdateMessageFlags={onUpdateMessageFlags}
            onDeleteMessage={onDeleteMessage}
            onRequestForward={(message) => openForwardPanel([message])}
            onReplyToMessage={replyToMessage}
            onEnsureMessageLoaded={onEnsureMessageLoaded}
            onToggleMessageSelection={toggleMessageSelection}
            onSaveSharedContact={onSaveSharedContact}
            onMessageSharedContact={onMessageSharedContact}
          />

          <MessageComposer
            key={userId}
            userId={userId}
            dropZoneContainer={conversationPanel}
            text={text}
            sending={sending}
            closing={closing}
            onSendPoll={onSendPoll}
            onTextChange={onTextChange}
            onSend={(options) => {
              onSend({ ...options, replyToMessageId: activeReply?.id });
              setReplyingTo(null);
            }}
            onSendMedia={async (files, caption, includeSignature) => {
              await onSendMedia(files, caption, activeReply?.id, includeSignature);
              setReplyingTo(null);
            }}
            onCloseWithBot={onCloseWithBot}
            allowCloseWithBot={!contact.isGroup}
            focusRequestKey={`${contact.id}:${composerFocusKey}`}
            replyingTo={activeReply}
            onCancelReply={() => setReplyingTo(null)}
          />

          <AnimatePresence>
            {forwardOpen && (
              <motion.div
                className="absolute inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onMouseDown={(event) => { if (event.target === event.currentTarget) setForwardOpen(false); }}
              >
                <motion.section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="forward-dialog-title"
                  initial={{ opacity: 0, x: 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="flex h-full w-full max-w-[470px] flex-col border-l border-white/10 bg-zinc-950 shadow-[-24px_0_70px_rgba(0,0,0,0.45)]"
                >
                  <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.07] px-4">
                    <button type="button" onClick={() => setForwardOpen(false)} aria-label="Fechar encaminhamento" className="flex size-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50">
                      <X className="size-5" aria-hidden="true" />
                    </button>
                    <h2 id="forward-dialog-title" className="text-base font-semibold text-zinc-100">Encaminhar mensagem para</h2>
                  </header>

                  <div className="shrink-0 px-4 pt-4 pb-3">
                    <label className="flex h-11 items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-3 transition-colors focus-within:border-white/40 focus-within:bg-white/[0.06]">
                      <Search className="size-[18px] shrink-0 text-zinc-500" aria-hidden="true" />
                      <input autoFocus value={forwardQuery} onChange={(event) => setForwardQuery(event.target.value)} placeholder="Pesquisar nome, número ou empresa" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" />
                    </label>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <p className="px-3 py-3 text-xs font-medium text-zinc-500">Contatos salvos</p>
                    <div className="space-y-1">
                      {forwardTargets.map((target) => {
                        const selected = forwardTargetIds.has(target.id);
                        return (
                          <button key={target.id} type="button" onClick={() => toggleForwardTarget(target.id)} aria-pressed={selected} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-white/50 ${selected ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"}`}>
                            <span className={`flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${selected ? "border-white bg-white text-zinc-950" : "border-zinc-600 bg-transparent text-transparent"}`}>
                              <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>
                            </span>
                            <Avatar contact={target} className="size-11" />
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-sm font-medium text-zinc-100">{target.name}</strong>
                              <span className="mt-0.5 block truncate text-xs text-zinc-500">{target.isGroup ? "Grupo do WhatsApp" : target.companyName || target.phone}</span>
                            </span>
                          </button>
                        );
                      })}
                      {!forwardTargets.length && <p className="px-3 py-10 text-center text-sm text-zinc-500">Nenhum contato salvo encontrado.</p>}
                    </div>
                  </div>

                  <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.07] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <span className="text-xs text-zinc-500">{forwardTargetIds.size} {forwardTargetIds.size === 1 ? "destino selecionado" : "destinos selecionados"}</span>
                    <button type="button" onClick={forwardSelectedMessages} disabled={!forwardTargetIds.size} className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-white/60 disabled:cursor-not-allowed disabled:opacity-35">
                      <Send className="size-4" aria-hidden="true" />
                      Encaminhar
                    </button>
                  </footer>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>

          {deleteSelectionOpen && (
            <Dialog.Root open onOpenChange={(open) => {
              if (selectionBusy) return;
              setDeleteSelectionOpen(open);
              if (!open) setDeleteSelectionError(null);
            }}>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                <div className="pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-4">
                  <Dialog.Popup className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 p-5 text-zinc-100 shadow-[0_28px_90px_rgba(0,0,0,0.65)] outline-none transition-[opacity,transform] duration-200 data-[ending-style]:translate-y-2 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
                    <div className="flex flex-col items-center text-center">
                      <div className="flex size-11 items-center justify-center rounded-full bg-red-500/10 text-red-300">
                        <Trash2 className="size-5" strokeWidth={1.8} aria-hidden="true" />
                      </div>
                      <Dialog.Title className="mt-4 text-base font-semibold tracking-[-0.01em]">
                        Apagar {selectedMessageIds.size === 1 ? "mensagem" : `${selectedMessageIds.size} mensagens`}?
                      </Dialog.Title>
                      <Dialog.Description className="mt-1 text-xs text-zinc-400">
                        Essa ação não poderá ser desfeita.
                      </Dialog.Description>
                    </div>
                    <div className="mt-5 flex flex-col gap-2">
                      <button type="button" disabled={selectionBusy} onClick={() => void deleteSelectedMessages("me")} className="flex h-11 w-full items-center justify-center rounded-xl bg-white/[0.07] px-4 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.11] focus-visible:outline-2 focus-visible:outline-white/60 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50">
                        Apagar para mim
                      </button>
                      <button type="button" disabled={selectionBusy} onClick={() => void deleteSelectedMessages("everyone")} className="flex h-11 w-full items-center justify-center rounded-xl bg-red-500/12 px-4 text-sm font-medium text-red-200 transition hover:bg-red-500/18 focus-visible:outline-2 focus-visible:outline-red-300/60 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50">
                        Apagar para todos
                      </button>
                    </div>
                    {selectionBusy && <p role="status" className="mt-3 text-center text-xs text-zinc-400">Apagando mensagens…</p>}
                    {deleteSelectionError && <p role="alert" className="mt-3 rounded-xl border border-red-400/15 bg-red-500/[0.06] px-3 py-2 text-center text-xs text-red-300">{deleteSelectionError}</p>}
                  </Dialog.Popup>
                </div>
              </Dialog.Portal>
            </Dialog.Root>
          )}

          <AnimatePresence>
            {favoritesOpen && (
              <motion.div
                className="absolute inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onMouseDown={(event) => { if (event.target === event.currentTarget) setFavoritesOpen(false); }}
              >
                <motion.section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="favorites-title"
                  initial={{ opacity: 0, x: 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="flex h-full w-full max-w-[430px] flex-col bg-zinc-950 shadow-[-24px_0_70px_rgba(0,0,0,0.38)]"
                >
                  <header className="flex h-16 shrink-0 items-center gap-3 px-4">
                    <button type="button" onClick={() => setFavoritesOpen(false)} aria-label="Fechar mensagens favoritas" className="flex size-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50">
                      <X className="size-5" aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                      <h2 id="favorites-title" className="text-base font-semibold text-zinc-100">Mensagens favoritas</h2>
                      {!favoritesLoading && <p className="text-xs text-zinc-500">{favoriteMessages.length} {favoriteMessages.length === 1 ? "mensagem" : "mensagens"}</p>}
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {favoritesLoading && (
                      <div className="flex h-40 items-center justify-center" role="status" aria-label="Carregando mensagens favoritas">
                        <span className="size-5 animate-spin rounded-full border-2 border-white/15 border-t-white/70 motion-reduce:animate-none" />
                      </div>
                    )}
                    {!favoritesLoading && favoritesError && <p role="alert" className="m-3 rounded-xl border border-red-400/15 bg-red-500/[0.06] p-3 text-center text-xs text-red-300">{favoritesError}</p>}
                    {!favoritesLoading && !favoritesError && !favoriteMessages.length && (
                      <div className="flex h-56 flex-col items-center justify-center text-center">
                        <span className="flex size-11 items-center justify-center rounded-full bg-white/[0.05] text-zinc-500"><Star className="size-5" aria-hidden="true" /></span>
                        <p className="mt-3 text-sm font-medium text-zinc-300">Nenhuma mensagem favorita</p>
                        <p className="mt-1 max-w-56 text-xs leading-5 text-zinc-500">Favorite uma mensagem para encontrá-la rapidamente aqui.</p>
                      </div>
                    )}
                    {!favoritesLoading && !favoritesError && favoriteMessages.length > 0 && (
                      <div className="space-y-1.5">
                        {favoriteMessages.map((message) => (
                          <button key={message.id} type="button" onClick={() => void goToFavoriteMessage(message.id)} className="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.055] focus-visible:outline-2 focus-visible:outline-white/50">
                            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-300/[0.08] text-amber-300"><Star className="size-4" fill="currentColor" aria-hidden="true" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-3">
                                <strong className="truncate text-xs font-medium text-zinc-300">{message.direction === "OUTGOING" ? "Você" : message.senderName || contact.name}</strong>
                                <time className="shrink-0 text-[10px] text-zinc-600">{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(message.createdAt))}</time>
                              </span>
                              <span className="mt-1 block line-clamp-2 text-sm leading-5 text-zinc-400">{message.content || "Mídia"}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {contactInfoOpen && (
            <ContactInfoPanel
              key={contact.id}
              contact={contact}
              onSetContactAssignment={onSetContactAssignment}
              onSetContactPriority={onSetContactPriority}
              onRenameContact={onRenameContact}
              onCloseWithBot={onCloseWithBot}
              onStartConversation={startParticipantConversation}
              closing={closing}
              onClose={() => setContactInfoOpen(false)}
              onSearch={() => { setContactInfoOpen(false); setSearchOpen(true); }}
            />
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
