"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Avatar } from "@/components/chat/avatar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { MessageSenderAvatar } from "@/components/chat/message-sender-avatar";
import { OutgoingMessageAvatar } from "@/components/chat/outgoing-message-avatar";
import { getGroupParticipants, type GroupParticipant } from "@/lib/chat-api";
import { systemMessageLabel } from "@/lib/system-message";
import type { Contact, Message } from "@/types/chat";

type MessageListProps = {
  currentUser: { id: string; name: string; image?: string | null };
  contact: Contact;
  contacts: Contact[];
  messages: Message[];
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  newMessageId: number | null;
  highlightedMessageId?: number | null;
  hasPinnedMessage: boolean;
  selectionMode: boolean;
  selectedMessageIds: Set<number>;
  onLoadOlderMessages: () => Promise<void>;
  onReactToMessage: (messageId: number, reaction: string) => Promise<void>;
  onUpdateMessageFlags: (messageId: number, flags: { pinned?: boolean; pinDurationHours?: 24 | 168 | 720; favorited?: boolean }) => Promise<void>;
  onDeleteMessage: (messageId: number, scope: "me" | "everyone") => Promise<void>;
  onRequestForward: (message: Message) => void;
  onReplyToMessage: (message: Message) => void;
  onEnsureMessageLoaded: (messageId: number) => Promise<boolean>;
  onToggleMessageSelection: (messageId: number) => void;
  onSaveSharedContact: (name: string, phone: string) => Promise<void>;
  onMessageSharedContact: (name: string, phone: string) => Promise<void>;
};

const CHAT_TIME_ZONE = "America/Sao_Paulo";

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: CHAT_TIME_ZONE,
});

const separatorDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: CHAT_TIME_ZONE,
});

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateKeyFormatter.format(date);
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const key = dateKey(date);

  if (key === dateKey(today)) return "Hoje";
  if (key === dateKey(yesterday)) return "Ontem";
  return separatorDateFormatter.format(date);
}

function identifierDigits(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

// Posiciona mensagens recebidas à esquerda e enviadas à direita.
export function MessageList({ currentUser, contact, contacts, messages, hasOlderMessages, loadingOlderMessages, newMessageId, highlightedMessageId, hasPinnedMessage, selectionMode, selectedMessageIds, onLoadOlderMessages, onReactToMessage, onUpdateMessageFlags, onDeleteMessage, onRequestForward, onReplyToMessage, onEnsureMessageLoaded, onToggleMessageSelection, onSaveSharedContact, onMessageSharedContact }: MessageListProps) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousContactIdRef = useRef<number | null>(null);
  const previousMessageCountRef = useRef(0);
  const previousLastMessageIdRef = useRef<number | null>(null);
  const nearBottomRef = useRef(true);
  const prependAnchorRef = useRef<{ height: number; top: number; firstMessageId: number | null } | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [navigatedMessageId, setNavigatedMessageId] = useState<number | null>(null);
  const [groupParticipantState, setGroupParticipantState] = useState<{ contactId: number; participants: GroupParticipant[] } | null>(null);
  const mediaMessages = useMemo(
    () => messages.filter((message) => message.type === "IMAGE" || message.type === "VIDEO"),
    [messages],
  );
  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const groupParticipantsByIdentifier = useMemo(() => {
    const result = new Map<string, GroupParticipant>();
    if (groupParticipantState?.contactId !== contact.id) return result;
    for (const participant of groupParticipantState.participants) {
      const phone = identifierDigits(participant.phone);
      const lid = identifierDigits(participant.lid);
      if (phone) result.set(phone, participant);
      if (lid) result.set(lid, participant);
    }
    return result;
  }, [contact.id, groupParticipantState]);

  useEffect(() => {
    if (!contact.isGroup) return;
    let active = true;
    void getGroupParticipants(contact.id)
      .then((participants) => { if (active) setGroupParticipantState({ contactId: contact.id, participants }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [contact.id, contact.isGroup]);

  function updateScrollState() {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.clientHeight - element.scrollTop;
    nearBottomRef.current = distanceFromBottom < 80;
    setShowScrollButton(distanceFromBottom > 180);

    if (element.scrollTop < 120 && hasOlderMessages && !loadingOlderMessages && !prependAnchorRef.current) {
      prependAnchorRef.current = {
        height: element.scrollHeight,
        top: element.scrollTop,
        firstMessageId: messages[0]?.id ?? null,
      };
      void onLoadOlderMessages();
    }
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    nearBottomRef.current = true;
  }

  // Ao trocar de conversa, ou receber uma mensagem enquanto já está no fim,
  // mantém o histórico ancorado na mensagem mais recente.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const contactChanged = previousContactIdRef.current !== contact.id;
    const lastMessageId = messages.at(-1)?.id ?? null;
    const messagesChanged = previousMessageCountRef.current !== messages.length || previousLastMessageIdRef.current !== lastMessageId;
    const prependAnchor = prependAnchorRef.current;

    if (contactChanged) {
      prependAnchorRef.current = null;
      element.scrollTop = element.scrollHeight;
      nearBottomRef.current = true;
    } else if (prependAnchor && messagesChanged && previousLastMessageIdRef.current === lastMessageId) {
      element.scrollTop = prependAnchor.top + (element.scrollHeight - prependAnchor.height);
      prependAnchorRef.current = null;
      nearBottomRef.current = false;
    } else if (messagesChanged && nearBottomRef.current) {
      element.scrollTop = element.scrollHeight;
      nearBottomRef.current = true;
    }

    previousContactIdRef.current = contact.id;
    previousMessageCountRef.current = messages.length;
    previousLastMessageIdRef.current = lastMessageId;
  }, [contact.id, messages.length, messages]);

  // Imagens, vídeos, transcrições e o teclado podem alterar a área disponível.
  useEffect(() => {
    const content = contentRef.current;
    const element = scrollRef.current;
    if (!content || !element) return;

    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) element.scrollTop = element.scrollHeight;
      const distanceFromBottom = element.scrollHeight - element.clientHeight - element.scrollTop;
      nearBottomRef.current = distanceFromBottom < 80;
      setShowScrollButton(distanceFromBottom > 180);
    });
    observer.observe(content);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Libera uma nova tentativa caso a busca anterior termine sem adicionar itens.
  useEffect(() => {
    const anchor = prependAnchorRef.current;
    if (!loadingOlderMessages && anchor && anchor.firstMessageId === (messages[0]?.id ?? null)) {
      prependAnchorRef.current = null;
    }
  }, [loadingOlderMessages, messages]);

  useEffect(() => {
    if (navigatedMessageId === null) return;
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${navigatedMessageId}"]`);
    if (!target) return;
    nearBottomRef.current = false;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    const timeout = window.setTimeout(() => setNavigatedMessageId(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [messages, navigatedMessageId, reduceMotion]);

  async function navigateToMessage(messageId: number) {
    const available = messages.some((message) => message.id === messageId)
      || await onEnsureMessageLoaded(messageId);
    if (available) setNavigatedMessageId(messageId);
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-swipe-back-area
        onScroll={updateScrollState}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none max-lg:touch-pan-y"
      >
        <div
          ref={contentRef}
          className="flex min-h-full flex-col gap-2 px-2 sm:px-5"
          style={{
            paddingTop: `calc(var(--chat-header-height, 64px) + env(safe-area-inset-top) + ${hasPinnedMessage ? "56px" : "var(--chat-message-top-gap, 0px)"})`,
            paddingBottom: "max(7rem, calc(var(--chat-composer-height, 0px) + 0.75rem))",
          }}
        >
        {loadingOlderMessages && (
          <div className="flex justify-center py-1" role="status" aria-label="Carregando mensagens anteriores">
            <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70 motion-reduce:animate-none" />
          </div>
        )}
        {messages.map((message, index) => {
        const outgoing = message.direction === "OUTGOING";
        const previousMessage = messages[index - 1];
        const showDateSeparator = dateKey(message.createdAt) !== dateKey(previousMessage?.createdAt ?? "");
        const label = showDateSeparator ? dateLabel(message.createdAt) : null;
        const isNewMessage = message.id === newMessageId;
        const isNewOutgoingMessage = isNewMessage && outgoing;
        if (message.type === "SYSTEM") {
          return (
            <motion.div
              id={`message-${message.id}`}
              data-message-id={message.id}
              key={message.clientId ?? message.id}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
              className="flex w-full flex-col items-center gap-1 py-0.5"
            >
              {label && (
                <div className="flex w-full items-center justify-center py-1" role="separator" aria-label={label}>
                  <span className="rounded-md border border-white/[0.06] bg-zinc-900/90 px-2.5 py-1 text-xs font-medium text-zinc-300 shadow-sm backdrop-blur-md lg:text-[10px]">
                    {label}
                  </span>
                </div>
              )}
              <span className="max-w-[85%] rounded-full bg-white/[0.035] px-2.5 py-1 text-center text-[10px] leading-4 text-zinc-500">
                {systemMessageLabel(message.content, currentUser.id)}
              </span>
            </motion.div>
          );
        }
        const cascadeStart = Math.max(0, messages.length - 12);
        const cascadeOrder = Math.max(0, index - cascadeStart);
        const selected = selectedMessageIds.has(message.id);
        const senderIdentifier = identifierDigits(message.senderPhone);
        const groupParticipant = contact.isGroup && !outgoing && senderIdentifier
          ? groupParticipantsByIdentifier.get(senderIdentifier)
          : undefined;
        const resolvedSenderIdentifiers = new Set([
          senderIdentifier,
          identifierDigits(groupParticipant?.phone),
          identifierDigits(groupParticipant?.lid),
        ].filter(Boolean));
        const savedSender = contact.isGroup && !outgoing && senderIdentifier
          ? contacts.find((item) => !item.isGroup && item.isSaved && (
              resolvedSenderIdentifiers.has(identifierDigits(item.phone))
              || resolvedSenderIdentifiers.has(identifierDigits(item.whatsappLid))
            ))
          : undefined;
        const whatsappSenderName = message.senderName
          && !resolvedSenderIdentifiers.has(identifierDigits(message.senderName))
          ? message.senderName
          : null;
        const displayMessage = groupParticipant || savedSender
          ? {
              ...message,
              senderName: savedSender?.name ?? whatsappSenderName ?? groupParticipant?.name ?? message.senderName,
              senderProfilePictureUrl: savedSender?.profilePictureUrl ?? groupParticipant?.profilePictureUrl ?? message.senderProfilePictureUrl,
            }
          : message;

        return (
          <motion.div
            id={`message-${message.id}`}
            data-message-id={message.id}
            key={message.clientId ?? message.id}
            initial={!reduceMotion ? {
              opacity: isNewOutgoingMessage ? 0.25 : 0,
              x: isNewOutgoingMessage ? 34 : outgoing ? 10 : -10,
              y: isNewOutgoingMessage ? 20 : 14,
              rotate: isNewOutgoingMessage ? 1.5 : outgoing ? 2.5 : -2.5,
              scale: isNewOutgoingMessage ? 0.82 : 0.97,
            } : false}
            animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            transition={reduceMotion
              ? { duration: 0 }
              : isNewOutgoingMessage
                ? { type: "spring", stiffness: 460, damping: 28, mass: 0.72 }
                : {
                    duration: 0.34,
                    delay: isNewMessage ? 0 : cascadeOrder * 0.055,
                    ease: [0.16, 1, 0.3, 1],
                  }
            }
            style={{ transformOrigin: outgoing ? "bottom right" : "bottom left" }}
            className={`relative z-0 flex w-full flex-col gap-2 rounded-2xl transition-[background-color,box-shadow] duration-200 has-[[aria-expanded=true]]:z-30 ${highlightedMessageId === message.id ? "bg-amber-300/10 shadow-[0_0_0_2px_rgba(252,211,77,0.28)]" : navigatedMessageId === message.id ? "bg-emerald-300/10 shadow-[0_0_0_2px_rgba(110,231,183,0.28)]" : ""}`}
          >
            {label && (
              <div className="flex w-full items-center justify-center py-1" role="separator" aria-label={label}>
                <span className="rounded-md border border-white/[0.06] bg-zinc-900/90 px-2.5 py-1 text-xs font-medium text-zinc-300 shadow-sm backdrop-blur-md lg:text-[10px]">
                  {label}
                </span>
              </div>
            )}
            <div
              className={`relative z-0 flex w-full min-w-0 items-center gap-2 overflow-visible rounded-2xl transition-[background-color,box-shadow] duration-150 hover:z-10 focus-within:z-10 ${selectionMode ? "py-2 pr-2 pl-11" : ""} ${selected ? "bg-white/[0.09] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" : ""} ${
                outgoing ? "justify-end" : "justify-start"
              }`}
            >
              {selectionMode && (
                <button
                  type="button"
                  onClick={() => onToggleMessageSelection(message.id)}
                  aria-label={`${selected ? "Remover" : "Adicionar"} mensagem da seleção`}
                  aria-pressed={selected}
                  className="absolute inset-0 z-20 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-white/70"
                >
                  <span className={`absolute left-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[6px] border transition-[color,background-color,border-color,transform,box-shadow] duration-150 ${selected ? "scale-100 border-white bg-white text-zinc-950 shadow-[0_2px_10px_rgba(255,255,255,0.22)]" : "scale-95 border-white/60 bg-white/[0.04] text-transparent"}`}>
                    <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>
                  </span>
                </button>
              )}
              {!outgoing && (contact.isGroup
                ? savedSender
                  ? <Avatar contact={savedSender} />
                  : <MessageSenderAvatar message={displayMessage} />
                : <Avatar contact={contact} />)}

              {/* O balão escolhe entre player de áudio e conteúdo textual. */}
              <MessageBubble savedContacts={contacts} onSaveSharedContact={onSaveSharedContact} onMessageSharedContact={onMessageSharedContact} message={displayMessage} quotedMessage={message.quotedMessageId ? messagesById.get(message.quotedMessageId) : undefined} contact={contact} mediaMessages={mediaMessages} onReact={onReactToMessage} onUpdateFlags={onUpdateMessageFlags} onDelete={onDeleteMessage} onRequestForward={onRequestForward} onReply={onReplyToMessage} onNavigateToMessage={navigateToMessage} />

              {outgoing && (
                <OutgoingMessageAvatar
                  user={message.sentByUser ?? (message.id < 0 ? currentUser : null)}
                />
              )}
            </div>
          </motion.div>
        );
        })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => scrollToBottom()}
        aria-label="Ir para a mensagem mais recente"
        aria-hidden={!showScrollButton}
        tabIndex={showScrollButton ? 0 : -1}
        className={`absolute right-1/2 bottom-[calc(var(--chat-composer-height,0px)+12px)] z-20 flex size-9 translate-x-1/2 items-center justify-center rounded-full border border-white/15 bg-zinc-900/90 text-zinc-200 shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-[opacity,transform,background-color] duration-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-white/60 motion-reduce:transition-none ${showScrollButton ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"}`}
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" />
        </svg>
      </button>
    </div>
  );
}
