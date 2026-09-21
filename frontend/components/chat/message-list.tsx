"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Avatar } from "@/components/chat/avatar";
import { MessageBubble } from "@/components/chat/message-bubble";
import type { Contact, Message } from "@/types/chat";

type MessageListProps = {
  contact: Contact;
  messages: Message[];
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

// Posiciona mensagens recebidas à esquerda e enviadas à direita.
export function MessageList({ contact, messages }: MessageListProps) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousContactIdRef = useRef<number | null>(null);
  const previousMessageCountRef = useRef(0);
  const previousLastMessageIdRef = useRef<number | null>(null);
  const nearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  function updateScrollState() {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.clientHeight - element.scrollTop;
    nearBottomRef.current = distanceFromBottom < 80;
    setShowScrollButton(distanceFromBottom > 180);
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
    if (contactChanged || (messagesChanged && nearBottomRef.current)) {
      element.scrollTop = element.scrollHeight;
      nearBottomRef.current = true;
    }

    previousContactIdRef.current = contact.id;
    previousMessageCountRef.current = messages.length;
    previousLastMessageIdRef.current = lastMessageId;
  }, [contact.id, messages.length, messages]);

  // Imagens, vídeos e transcrições podem alterar a altura depois da renderização.
  useEffect(() => {
    const content = contentRef.current;
    const element = scrollRef.current;
    if (!content || !element) return;

    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) element.scrollTop = element.scrollHeight;
      updateScrollState();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <div
          ref={contentRef}
          className="flex min-h-full flex-col gap-3 p-5 pt-16"
          style={{ paddingBottom: "max(10rem, calc(var(--chat-composer-height, 0px) + 1rem))" }}
        >
        {messages.map((message, index) => {
        const outgoing = message.direction === "OUTGOING";
        const previousMessage = messages[index - 1];
        const showDateSeparator = dateKey(message.createdAt) !== dateKey(previousMessage?.createdAt ?? "");
        const label = showDateSeparator ? dateLabel(message.createdAt) : null;
        const cascadeIndex = Math.max(0, index - Math.max(0, messages.length - 12));

        return (
          <motion.div
            key={message.id}
            initial={reduceMotion ? false : {
              opacity: 0,
              x: outgoing ? 14 : -14,
              y: 10,
              rotate: outgoing ? 1.2 : -1.2,
              scale: 0.96,
            }}
            animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.38,
              delay: reduceMotion ? 0 : cascadeIndex * 0.045,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ transformOrigin: outgoing ? "bottom right" : "bottom left" }}
            className="flex w-full flex-col gap-3"
          >
            {label && (
              <div className="flex w-full items-center justify-center py-1" role="separator" aria-label={label}>
                <span className="rounded-md border border-white/[0.06] bg-zinc-900/90 px-2.5 py-1 text-[10px] font-medium text-zinc-300 shadow-sm backdrop-blur-md">
                  {label}
                </span>
              </div>
            )}
            <div
              className={`relative z-0 flex w-full min-w-0 items-center gap-2 overflow-visible hover:z-10 focus-within:z-10 ${
                outgoing ? "justify-end" : "justify-start"
              }`}
            >
              {!outgoing && <Avatar contact={contact} />}

              {/* O balão escolhe entre player de áudio e conteúdo textual. */}
              <MessageBubble message={message} />
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
