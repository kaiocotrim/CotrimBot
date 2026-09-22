"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  CaretDown,
  Copy,
  PushPin,
  Smiley,
  Sparkle,
  Star,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
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
  contacts: Contact[];
  imageMessages: Message[];
  onReact: (messageId: number, reaction: string) => Promise<void>;
  onForwardMessage: (message: Message, target: Contact) => void;
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
export function MessageBubble({ message, contact, contacts, imageMessages, onReact, onForwardMessage }: MessageBubbleProps) {
  const [reacting, setReacting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [choosingContact, setChoosingContact] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const actionControlsRef = useRef<HTMLDivElement>(null);
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
      className="shrink-0 select-none text-[10px] leading-none font-normal tabular-nums text-white/55"
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
    if (!actionsOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!actionControlsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopyError(false);
      setActionsOpen(false);
    } catch {
      setCopyError(true);
    }
  }

  async function chooseReaction(reaction: string) {
    if (reacting) return;
    setReacting(true);
    try {
      await onReact(message.id, message.reaction === reaction ? "" : reaction);
      setActionsOpen(false);
    } catch (error) {
      console.error("Erro ao reagir à mensagem:", error);
    } finally {
      setReacting(false);
    }
  }

  const quickReactionBar = (
    <div className="mb-1.5 flex w-max items-center gap-0.5 rounded-full border border-white/10 bg-zinc-900/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      {QUICK_REACTIONS.map((reaction) => (
        <button
          key={reaction}
          type="button"
          disabled={reacting}
          onClick={() => void chooseReaction(reaction)}
          aria-label={`${message.reaction === reaction ? "Remover" : "Reagir com"} ${reaction}`}
          className={`flex size-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-50 ${message.reaction === reaction ? "bg-white/10" : ""}`}
        >
          <EmojiText content={reaction} />
        </button>
      ))}
      <button type="button" aria-label="Mais reações" className="flex size-7 items-center justify-center rounded-full text-lg leading-none text-zinc-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/50">+</button>
    </div>
  );

  const menuButtonClass = "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none";

  return (
    <div
      className={`group/message relative min-w-0 max-w-[min(62%,620px)] text-[13.5px] leading-[1.4] font-normal text-white [overflow-wrap:anywhere] ${message.reaction ? "mb-3" : ""} ${
        isAudio
          ? "relative w-[min(380px,62vw)] overflow-visible rounded-[24px] border border-white/15 bg-gradient-to-br from-white/[0.09] via-zinc-900/95 to-zinc-950/95 px-3.5 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14),0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl"
          : `rounded-[24px] px-3.5 py-2.5 ${outgoing ? "bg-green-600" : "bg-zinc-800"}`
      }`}
    >
      <div ref={actionControlsRef} className="absolute -top-2 right-2 z-40">
        <button
          type="button"
          aria-label="Ações da mensagem"
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          onClick={() => {
            setActionsOpen((open) => !open);
            setChoosingContact(false);
            setCopyError(false);
          }}
          className={`flex size-5 items-center justify-center rounded-full text-zinc-300 transition-[opacity,transform,color] duration-150 hover:text-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white/50 [@media(hover:none)]:opacity-100 ${actionsOpen ? "opacity-100" : "opacity-0 group-hover/message:opacity-100"}`}
        >
          <CaretDown size={13} weight="bold" aria-hidden="true" />
        </button>
        {actionsOpen && (
          <div className="absolute right-0 top-7 flex min-w-[178px] flex-col items-end">
            {quickReactionBar}
            <div role="menu" aria-label="Ações da mensagem" className="w-[178px] overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 p-1 text-[12px] font-medium leading-tight text-zinc-100 shadow-xl backdrop-blur-xl">
              {choosingContact ? (
                <>
                  <div className="px-3 py-2 text-[11px] leading-tight text-zinc-400">Encaminhar para</div>
                  <div className="max-h-48 overflow-y-auto">
                    {contacts.map((target) => (
                      <button key={target.id} type="button" role="menuitem" onClick={() => { onForwardMessage(message, target); setActionsOpen(false); }} className="block w-full truncate rounded-md px-3 py-2 text-left hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none">{target.name}</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button type="button" role="menuitem" className={menuButtonClass}>
                    <ArrowBendUpLeft size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Responder</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => void copyMessage()} disabled={!message.content} className={`${menuButtonClass} disabled:opacity-40`}>
                    <Copy size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Copiar</span>
                  </button>
                  <button type="button" role="menuitem" className={menuButtonClass}>
                    <Smiley size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Reagir</span>
                  </button>
                  {message.content && (
                    <button type="button" role="menuitem" onClick={() => setChoosingContact(true)} className={menuButtonClass}>
                      <ArrowBendUpRight size={15} weight="bold" className="shrink-0 text-zinc-200" />
                      <span>Encaminhar</span>
                    </button>
                  )}
                  <button type="button" role="menuitem" className={menuButtonClass}>
                    <PushPin size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Fixar</span>
                  </button>
                  <button type="button" role="menuitem" className={menuButtonClass}>
                    <Sparkle size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Pergunte a Meta AI</span>
                  </button>
                  <button type="button" role="menuitem" className={menuButtonClass}>
                    <Star size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Favoritar</span>
                  </button>
                  <div className="my-1 border-t border-white/10" />
                  <button type="button" role="menuitem" className={menuButtonClass}>
                    <WarningCircle size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Denunciar</span>
                  </button>
                  <button type="button" role="menuitem" className={menuButtonClass}>
                    <Trash size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Apagar</span>
                  </button>
                  {copyError && <p role="alert" className="px-3 py-1 text-[11px] text-red-300">Não foi possível copiar</p>}
                </>
              )}
            </div>
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
