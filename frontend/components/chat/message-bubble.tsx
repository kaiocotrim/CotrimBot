"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioMessage } from "@/components/chat/audio-message";
import { DocumentMessage } from "@/components/chat/document-message";
import { EmojiText } from "@/components/chat/emoji-text";
import { ImageMessage } from "@/components/chat/image-message";
import { TextMessage } from "@/components/chat/text-message";
import { VideoMessage } from "@/components/chat/video-message";
import type { Contact, Message } from "@/types/chat";

type MessageBubbleProps = {
  message: Message;
  contact: Contact;
  imageMessages: Message[];
  onReact: (messageId: number, reaction: string) => Promise<void>;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3333";

const messageTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Sao_Paulo",
});

const messageDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

// Mantém o estilo do balão e delega o conteúdo ao componente de cada tipo.
export function MessageBubble({ message, contact, imageMessages, onReact }: MessageBubbleProps) {
  const [reacting, setReacting] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const reactionControlsRef = useRef<HTMLDivElement>(null);
  const outgoing = message.direction === "OUTGOING";
  const isAudio = message.type === "AUDIO";
  const mediaUrl = `${API_URL}/messages/${message.id}/media`;
  const createdAt = new Date(message.createdAt);
  const hasValidDate = !Number.isNaN(createdAt.getTime());
  const inlineTime = message.type === "TEXT" && !/[\r\n]/.test(message.content);

  // Cada caso seleciona um único componente, sem duplicar o conteúdo da mídia.
  const content = (() => {
    switch (message.type) {
      case "TEXT":
        return <TextMessage content={message.content} />;
      case "AUDIO":
        return <AudioMessage
          mediaUrl={mediaUrl}
          messageId={message.id}
        />
      case "IMAGE":
        return <ImageMessage
          messageId={message.id}
          mediaUrl={mediaUrl}
          content={message.content}
          contact={contact}
          createdAt={message.createdAt}
          gallery={imageMessages.map((image) => ({
            id: image.id,
            mediaUrl: `${API_URL}/messages/${image.id}/media`,
            content: image.content,
            createdAt: image.createdAt,
          }))}
        />;
      case "VIDEO":
        return <VideoMessage mediaUrl={mediaUrl} content={message.content} />;
      case "DOCUMENT":
        return <DocumentMessage mediaUrl={mediaUrl} content={message.content} />;
      default:
        return <TextMessage content={message.content} />;
    }
  })();

  const timestamp = hasValidDate ? (
    <time
      dateTime={message.createdAt}
      title={messageDateFormatter.format(createdAt)}
      className="shrink-0 select-none text-[9px] leading-none tabular-nums text-white/55"
    >
      {messageTimeFormatter.format(createdAt)}
    </time>
  ) : null;

  const readReceipt = outgoing ? (
    <span className={message.readAt ? "text-sky-300" : "text-white/50"} title={message.readAt ? "Visualizada" : "Enviada"} aria-label={message.readAt ? "Mensagem visualizada" : "Mensagem enviada"}>
      <svg className="h-3 w-[17px]" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m1 6 3 3 6-7" />
        <path d="m7 8 2 2 8-8" />
      </svg>
    </span>
  ) : null;

  useEffect(() => {
    if (!reactionsOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!reactionControlsRef.current?.contains(event.target as Node)) setReactionsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setReactionsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [reactionsOpen]);

  async function chooseReaction(reaction: string) {
    if (reacting) return;
    setReacting(true);
    try {
      await onReact(message.id, message.reaction === reaction ? "" : reaction);
      setReactionsOpen(false);
    } catch (error) {
      console.error("Erro ao reagir à mensagem:", error);
    } finally {
      setReacting(false);
    }
  }

  return (
    <div
      className={`group/message relative min-w-0 max-w-[70%] text-white [overflow-wrap:anywhere] ${message.reaction ? "mb-3" : ""} ${
        isAudio
          ? "relative w-[min(440px,70vw)] overflow-visible rounded-[24px] border border-white/15 bg-gradient-to-br from-white/[0.09] via-zinc-900/95 to-zinc-950/95 px-4 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14),0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl"
          : `rounded-[24px] px-4 py-2 ${outgoing ? "bg-green-600" : "bg-zinc-800"}`
      }`}
    >
      <div ref={reactionControlsRef} className={`absolute top-1/2 z-30 -translate-y-1/2 ${outgoing ? "right-full mr-1" : "left-full ml-1"}`}>
        <button
          type="button"
          onClick={() => setReactionsOpen((current) => !current)}
          aria-label="Reagir à mensagem"
          aria-expanded={reactionsOpen}
          className={`flex size-7 items-center justify-center text-white/75 transition-[opacity,color,transform] duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 ${reactionsOpen ? "scale-100 text-white opacity-100" : "scale-90 opacity-0 group-hover/message:scale-100 group-hover/message:opacity-100 group-focus-within/message:scale-100 group-focus-within/message:opacity-100"}`}
        >
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9h.01M15 9h.01" /></svg>
        </button>

        {reactionsOpen && (
          <div className={`absolute bottom-full mb-2 flex items-center gap-0.5 rounded-full border border-white/10 bg-zinc-900/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl ${outgoing ? "right-0" : "left-0"}`}>
            {QUICK_REACTIONS.map((reaction) => (
              <button
                key={reaction}
                type="button"
                disabled={reacting}
                onClick={() => void chooseReaction(reaction)}
                aria-label={`${message.reaction === reaction ? "Remover" : "Reagir com"} ${reaction}`}
                className={`flex size-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-50 ${message.reaction === reaction ? "bg-white/10" : ""}`}
              >
                <EmojiText content={reaction} />
              </button>
            ))}
          </div>
        )}
      </div>
      {inlineTime ? (
        <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0">{content}</div>
          <span className="flex shrink-0 items-center gap-0.5">{timestamp}{readReceipt}</span>
        </div>
      ) : (
        content
      )}
      {!inlineTime && timestamp && (
        <div className={`flex items-center justify-end gap-0.5 ${isAudio ? "mt-2" : "mt-1"}`}>
          {timestamp}
          {readReceipt}
        </div>
      )}
      <AnimatePresence mode="wait">
      {message.reaction && (
        <motion.button
          key={message.reaction}
          type="button"
          initial={{ opacity: 0, scale: 0.65, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.75, y: -2 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => void chooseReaction(message.reaction ?? "")}
          disabled={reacting}
          aria-label={`Remover reação ${message.reaction}`}
          className={`absolute -bottom-4 flex h-6 min-w-7 items-center justify-center rounded-full border border-white/10 bg-zinc-900 px-1.5 text-sm shadow-md hover:scale-105 ${outgoing ? "right-3" : "left-3"}`}
        >
          <EmojiText content={message.reaction} />
        </motion.button>
      )}
      </AnimatePresence>
    </div>
  );
}
