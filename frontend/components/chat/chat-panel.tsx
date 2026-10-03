"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChatHeader } from "@/components/chat/chat-header";
import { EmptyChatAnimation } from "@/components/chat/empty-chat-animation";
import { ContactInfoPanel } from "@/components/chat/contact-info-panel";
import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import type { Contact, Message } from "@/types/chat";

type ChatPanelProps = {
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

  onTextChange: (text: string) => void;
  onSend: (options: { private: boolean; replyToMessageId?: number }) => void;
  onLoadOlderMessages: () => Promise<void>;
  onEnsureMessageLoaded: (messageId: number) => Promise<boolean>;
  onReactToMessage: (messageId: number, reaction: string) => Promise<void>;
  onUpdateMessageFlags: (messageId: number, flags: { pinned?: boolean; favorited?: boolean }) => Promise<void>;
  onForwardMessage: (message: Message, target: Contact) => void;

  // Envia arquivos + legenda opcional.
  onSendMedia: (
    files: File[],
    caption?: string,
    replyToMessageId?: number,
  ) => Promise<void>;

  onCloseWithBot: () => void;
  onRenameContact: (contactId: number, name: string) => Promise<void>;
};

// Agrupa todas as partes visuais da conversa selecionada.
export function ChatPanel({
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
  onTextChange,
  onSend,
  onLoadOlderMessages,
  onEnsureMessageLoaded,
  onReactToMessage,
  onUpdateMessageFlags,
  onForwardMessage,
  onSendMedia,
  onCloseWithBot,
  onRenameContact,
}: ChatPanelProps) {
  const [conversationPanel, setConversationPanel] = useState<HTMLElement | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("pt-BR");
    return query ? messages.filter((message) => message.content.toLocaleLowerCase("pt-BR").includes(query)) : [];
  }, [messages, searchQuery]);
  const normalizedSearchIndex = searchResults.length
    ? Math.min(searchIndex, searchResults.length - 1)
    : 0;
  const highlightedMessageId = searchResults[normalizedSearchIndex]?.id ?? null;
  const activeReply = replyingTo?.contactId === contact?.id ? replyingTo : null;

  function replyToMessage(message: Message) {
    setReplyingTo(message);
    setComposerFocusKey((current) => current + 1);
  }

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLocaleLowerCase("pt-BR") === "f") {
        event.preventDefault();
        setContactInfoOpen(false);
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [searchOpen]);

  useEffect(() => {
    if (highlightedMessageId === null) return;
    document.getElementById(`message-${highlightedMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedMessageId]);

  if (!contact) {
    return (
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-zinc-500">
        <EmptyChatAnimation />
        <p>Selecione um contato para iniciar</p>
      </section>
    );
  }

  return (
    <section ref={setConversationPanel} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Papel de parede fornecido pelo usuário via Unsplash. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/mesh-gradient2.png')" }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-zinc-950/50" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <ChatHeader
          contact={contact}
          isTyping={isTyping}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          currentResult={normalizedSearchIndex}
          resultCount={searchResults.length}
          onOpenSearch={() => { setContactInfoOpen(false); setSearchOpen(true); }}
          onOpenContactInfo={() => setContactInfoOpen(true)}
          onSearchQueryChange={(value) => { setSearchQuery(value); setSearchIndex(0); }}
          onPreviousResult={() => setSearchIndex((current) => searchResults.length ? (current - 1 + searchResults.length) % searchResults.length : 0)}
          onNextResult={() => setSearchIndex((current) => searchResults.length ? (current + 1) % searchResults.length : 0)}
          onCloseSearch={() => { setSearchOpen(false); setSearchQuery(""); }}
        />
      </div>

      <MessageList
        contact={contact}
        contacts={contacts}
        messages={messages}
        hasOlderMessages={hasOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        newMessageId={newMessageId}
        highlightedMessageId={highlightedMessageId}
        onLoadOlderMessages={onLoadOlderMessages}
        onReactToMessage={onReactToMessage}
        onUpdateMessageFlags={onUpdateMessageFlags}
        onForwardMessage={onForwardMessage}
        onReplyToMessage={replyToMessage}
        onEnsureMessageLoaded={onEnsureMessageLoaded}
      />

      <MessageComposer
        dropZoneContainer={conversationPanel}
        text={text}
        sending={sending}
        closing={closing}
        onTextChange={onTextChange}
        onSend={(options) => {
          onSend({ ...options, replyToMessageId: activeReply?.id });
          setReplyingTo(null);
        }}
        onSendMedia={async (files, caption) => {
          await onSendMedia(files, caption, activeReply?.id);
          setReplyingTo(null);
        }}
        onCloseWithBot={onCloseWithBot}
        allowCloseWithBot={!contact.isGroup}
        focusRequestKey={composerFocusKey}
        replyingTo={activeReply}
        onCancelReply={() => setReplyingTo(null)}
      />

      <AnimatePresence>
        {contactInfoOpen && (
          <ContactInfoPanel
            key={contact.id}
            contact={contact}
            onRenameContact={onRenameContact}
            onClose={() => setContactInfoOpen(false)}
            onSearch={() => { setContactInfoOpen(false); setSearchOpen(true); }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
