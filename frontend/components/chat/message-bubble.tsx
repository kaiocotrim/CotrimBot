"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
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
import { StickerMessage } from "@/components/chat/sticker-message";
import { TextMessage } from "@/components/chat/text-message";
import { VideoMessage } from "@/components/chat/video-message";
import type { Contact, Message } from "@/types/chat";

type MessageBubbleProps = {
  message: Message;
  contact: Contact;
  contacts: Contact[];
  mediaMessages: Message[];
  onReact: (messageId: number, reaction: string) => Promise<void>;
  onUpdateFlags: (messageId: number, flags: { pinned?: boolean; favorited?: boolean }) => Promise<void>;
  onForwardMessage: (message: Message, target: Contact) => void;
  onReply: (message: Message) => void;
  onNavigateToMessage: (messageId: number) => Promise<void>;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "/api";

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
export function MessageBubble({ message, contact, contacts, mediaMessages, onReact, onUpdateFlags, onForwardMessage, onReply, onNavigateToMessage }: MessageBubbleProps) {
  const [reacting, setReacting] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [choosingContact, setChoosingContact] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingFlags, setUpdatingFlags] = useState(false);
  const [pinAnimationKey, setPinAnimationKey] = useState(0);
  const actionControlsRef = useRef<HTMLDivElement>(null);
  const reactionControlsRef = useRef<HTMLDivElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const reactionTriggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [reactionPosition, setReactionPosition] = useState({ top: 0, left: 0 });
  const outgoing = message.direction === "OUTGOING";
  const isPrivate = Boolean(message.private);
  const isAudio = message.type === "AUDIO";
  const isImage = message.type === "IMAGE";
  const isVideo = message.type === "VIDEO";
  const isSticker = message.type === "STICKER";
  const imageHasCaption = isImage && message.content !== "[Imagem]";
  const mediaUrl = `${API_URL}/messages/${message.id}/media`;
  const quotedMediaMessage = message.quotedMessageId
    ? mediaMessages.find((media) => media.id === message.quotedMessageId)
    : undefined;
  const createdAt = new Date(message.createdAt);
  const hasValidDate = !Number.isNaN(createdAt.getTime());
  const inlineTime = message.type === "TEXT" && !/[\r\n]/.test(message.content) && !message.deletedAt;
  const reduceMotion = useReducedMotion();

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
          gallery={mediaMessages.filter((media) => media.type === "IMAGE").map((image) => ({
            id: image.id,
            mediaUrl: `${API_URL}/messages/${image.id}/media`,
            content: image.content,
            createdAt: image.createdAt,
          }))}
        />;
      case "VIDEO":
        return <VideoMessage
          messageId={message.id}
          mediaUrl={mediaUrl}
          content={message.content}
          contact={contact}
          createdAt={message.createdAt}
          gallery={mediaMessages.map((media) => ({
            id: media.id,
            type: media.type as "IMAGE" | "VIDEO",
            mediaUrl: `${API_URL}/messages/${media.id}/media`,
            content: media.content,
            createdAt: media.createdAt,
          }))}
        />;
      case "STICKER":
        return <StickerMessage mediaUrl={mediaUrl} />;
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
      className={`shrink-0 select-none text-[10px] leading-none font-normal tabular-nums ${isPrivate ? "text-amber-800/70" : "text-white/55"}`}
    >
      {messageTimeFormatter.format(createdAt)}
    </time>
  ) : null;

  const readReceipt = outgoing ? (
    message.deliveryStatus === "failed" ? (
      <span className="text-red-200" title="Mensagem não enviada" aria-label="Mensagem não enviada">
        <WarningCircle size={14} weight="fill" aria-hidden="true" />
      </span>
    ) : (
      <span className={message.readAt ? "text-sky-300" : "text-white/50"} title={message.readAt ? "Visualizada" : "Enviada"} aria-label={message.readAt ? "Mensagem visualizada" : "Mensagem enviada"}>
        <svg className="h-3 w-[17px]" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m1 6 3 3 6-7" />
          <path d="m7 8 2 2 8-8" />
        </svg>
      </span>
    )
  ) : null;

  useEffect(() => {
    if (!actionsOpen && !reactionPickerOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!actionControlsRef.current?.contains(event.target as Node) && !reactionControlsRef.current?.contains(event.target as Node) && !reactionPickerRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
        setReactionPickerOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionsOpen(false);
        setReactionPickerOpen(false);
      }
    }
    function closeOnScroll() { setReactionPickerOpen(false); }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [actionsOpen, reactionPickerOpen]);

  function openReactionPicker() {
    const trigger = reactionTriggerRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (!trigger || !bubble) return;
    const pickerWidth = 248;
    const pickerHeight = 44;
    const left = outgoing ? trigger.left : trigger.right - pickerWidth;
    setReactionPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - pickerWidth - 8)),
      top: bubble.top >= pickerHeight + 8
        ? bubble.top - pickerHeight - 8
        : Math.min(bubble.bottom + 8, window.innerHeight - pickerHeight - 8),
    });
    setActionsOpen(false);
    setReactionPickerOpen(true);
  }

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
      setReactionPickerOpen(false);
    } catch (error) {
      console.error("Erro ao reagir à mensagem:", error);
    } finally {
      setReacting(false);
    }
  }

  async function updateFlag(flags: { pinned?: boolean; favorited?: boolean }) {
    if (updatingFlags) return;
    setUpdatingFlags(true);
    setActionError(null);
    if (flags.pinned) setPinAnimationKey((key) => key + 1);
    try {
      await onUpdateFlags(message.id, flags);
      setActionsOpen(false);
    } catch {
      setActionError("Não foi possível atualizar a mensagem");
    } finally {
      setUpdatingFlags(false);
    }
  }

  const quickReactionBar = (
    <div className="mb-1.5 flex w-max items-center gap-0.5 rounded-full border border-white/10 bg-zinc-900/95 px-1.5 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      {QUICK_REACTIONS.map((reaction) => (
        <button
          key={reaction}
          type="button"
          disabled={reacting}
          onClick={() => void chooseReaction(reaction)}
          aria-label={`${message.reaction === reaction ? "Remover" : "Reagir com"} ${reaction}`}
          className={`flex size-8 items-center justify-center rounded-full text-base transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-50 ${message.reaction === reaction ? "bg-white/10" : ""}`}
        >
          <EmojiText content={reaction} />
        </button>
      ))}
      <button type="button" aria-label="Mais reações" className="flex size-8 items-center justify-center rounded-full text-lg leading-none text-zinc-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/50">+</button>
    </div>
  );

  const menuButtonClass = "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none";

  return (
    <div
      ref={bubbleRef}
      onContextMenu={(event) => {
        event.preventDefault();
        setActionsOpen(true);
        setReactionPickerOpen(false);
        setChoosingContact(false);
        setCopyError(false);
        setActionError(null);
      }}
      className={`group/message relative min-w-0 max-w-[min(62%,620px)] text-[13.5px] leading-[1.4] font-normal [overflow-wrap:anywhere] ${isPrivate ? "text-amber-950" : "text-white"} ${message.reaction ? "mb-3" : ""} ${
        isPrivate
          ? "rounded-[24px] bg-amber-100 px-3.5 py-2.5 shadow-[0_4px_16px_rgba(120,83,15,0.12)]"
          : isSticker
          ? "overflow-visible bg-transparent p-0"
          : isAudio
          ? "relative w-[min(380px,62vw)] overflow-visible rounded-[24px] border border-white/15 bg-gradient-to-br from-white/[0.09] via-zinc-900/95 to-zinc-950/95 px-3.5 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14),0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl"
          : isVideo
            ? `rounded-[20px] p-[3px] shadow-[0_3px_12px_rgba(0,0,0,0.16)] ${outgoing ? "bg-green-600" : "bg-zinc-800"}`
          : isImage
            ? `rounded-[18px] p-[3px] shadow-[0_3px_12px_rgba(0,0,0,0.16)] ${outgoing ? "bg-green-600" : "bg-zinc-800"}`
            : `rounded-[24px] px-3.5 py-2.5 ${outgoing ? "bg-green-600" : "bg-zinc-800"}`
      }`}
    >
      <AnimatePresence>
        {pinAnimationKey > 0 && (
          <motion.span
            key={pinAnimationKey}
            aria-hidden="true"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            animate={reduceMotion ? { opacity: 0 } : { opacity: [0, 0.8, 0], scale: [0.97, 1.025, 1.045] }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.72, times: [0, 0.35, 1], ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute -inset-[3px] z-10 rounded-[27px] border border-amber-300/55 shadow-[0_0_22px_rgba(252,211,77,0.22)]"
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
      {(message.pinned || message.favorited) && (
        <motion.span
          layout
          initial={reduceMotion ? false : { opacity: 0, y: 5, scale: 0.72 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 3, scale: 0.8 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 24, mass: 0.65 }}
          className={`absolute -top-2 z-20 flex h-5 items-center gap-1 rounded-full border border-white/10 bg-zinc-900 px-1.5 text-amber-300 shadow-md ${outgoing ? "left-3" : "right-3"}`}
          title={[message.pinned ? "Mensagem fixada" : "", message.favorited ? "Mensagem favorita" : ""].filter(Boolean).join(" e ")}
        >
          <AnimatePresence initial={false}>
            {message.pinned && (
              <motion.span
                key="pinned"
                initial={reduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.4 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 25, scale: 0.5 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 650, damping: 20 }}
                className="flex"
              >
                <PushPin size={11} weight="fill" aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>
          {message.favorited && <Star size={11} weight="fill" aria-hidden="true" />}
        </motion.span>
      )}
      </AnimatePresence>
      {isPrivate && (
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-amber-700">
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <span>Privado</span>
        </div>
      )}
      {contact.isGroup && !outgoing && message.senderName && (
        <p className={`${isImage || isVideo ? "px-3 pt-2 pb-2" : "mb-1"} pr-5 text-[11px] font-semibold leading-tight text-emerald-300`}>
          {message.senderName}
        </p>
      )}
      <div ref={reactionControlsRef} className={`absolute top-1/2 z-50 -translate-y-1/2 ${outgoing ? "-left-6" : "-right-6"}`}>
        <button
          ref={reactionTriggerRef}
          type="button"
          aria-label="Abrir sugestões de emoji"
          aria-expanded={reactionPickerOpen}
          onClick={() => reactionPickerOpen ? setReactionPickerOpen(false) : openReactionPicker()}
          className={`flex size-6 items-center justify-center text-zinc-300 transition-[opacity,transform,color] duration-150 hover:scale-110 hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 group-hover/message:opacity-100 [@media(hover:none)]:opacity-100 ${reactionPickerOpen ? "opacity-100" : "opacity-0"}`}
        >
          <Smiley size={14} weight="regular" aria-hidden="true" />
        </button>
      </div>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {reactionPickerOpen && (
            <motion.div
              ref={reactionPickerRef}
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="fixed z-[100] origin-bottom-left"
              style={reactionPosition}
            >
              {quickReactionBar}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <div ref={actionControlsRef} className="absolute top-1.5 right-2 z-40">
        <button
          type="button"
          aria-label="Ações da mensagem"
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          onClick={() => {
            setActionsOpen((open) => !open);
            setReactionPickerOpen(false);
            setChoosingContact(false);
            setCopyError(false);
            setActionError(null);
          }}
          className={`flex size-5 items-center justify-center rounded-full text-zinc-300 transition-[opacity,transform,color] duration-150 hover:text-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white/50 [@media(hover:none)]:opacity-100 ${actionsOpen ? "opacity-100" : "opacity-0 group-hover/message:opacity-100"}`}
        >
          <CaretDown size={13} weight="bold" aria-hidden="true" />
        </button>
        <AnimatePresence>
        {actionsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-7 flex min-w-[178px] origin-top-right flex-col items-end"
          >
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
                  <button type="button" role="menuitem" onClick={() => { onReply(message); setActionsOpen(false); }} className={menuButtonClass}>
                    <ArrowBendUpLeft size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Responder</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => void copyMessage()} disabled={!message.content} className={`${menuButtonClass} disabled:opacity-40`}>
                    <Copy size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Copiar</span>
                  </button>
                  <button type="button" role="menuitem" onClick={openReactionPicker} className={menuButtonClass}>
                    <Smiley size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Reagir</span>
                  </button>
                  {message.content && (
                    <button type="button" role="menuitem" onClick={() => setChoosingContact(true)} className={menuButtonClass}>
                      <ArrowBendUpRight size={15} weight="bold" className="shrink-0 text-zinc-200" />
                      <span>Encaminhar</span>
                    </button>
                  )}
                  <button type="button" role="menuitem" disabled={updatingFlags} onClick={() => void updateFlag({ pinned: !message.pinned })} className={`${menuButtonClass} disabled:opacity-50`}>
                    <PushPin size={15} weight={message.pinned ? "fill" : "bold"} className="shrink-0 text-zinc-200" />
                    <span>{message.pinned ? "Desafixar" : "Fixar"}</span>
                  </button>
                  <button type="button" role="menuitem" disabled className={`${menuButtonClass} cursor-not-allowed opacity-40`} title="Em breve">
                    <Sparkle size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Pergunte a Meta AI</span>
                  </button>
                  <button type="button" role="menuitem" disabled={updatingFlags} onClick={() => void updateFlag({ favorited: !message.favorited })} className={`${menuButtonClass} disabled:opacity-50`}>
                    <Star size={15} weight={message.favorited ? "fill" : "bold"} className="shrink-0 text-zinc-200" />
                    <span>{message.favorited ? "Desfavoritar" : "Favoritar"}</span>
                  </button>
                  <div className="my-1 border-t border-white/10" />
                  <button type="button" role="menuitem" disabled className={`${menuButtonClass} cursor-not-allowed opacity-40`} title="Em breve">
                    <WarningCircle size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Denunciar</span>
                  </button>
                  <button type="button" role="menuitem" disabled className={`${menuButtonClass} cursor-not-allowed opacity-40`} title="Em breve">
                    <Trash size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Apagar</span>
                  </button>
                  {copyError && <p role="alert" className="px-3 py-1 text-[11px] text-red-300">Não foi possível copiar</p>}
                  {actionError && <p role="alert" className="px-3 py-1 text-[11px] text-red-300">{actionError}</p>}
                </>
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
      {message.quotedContent && (
        <button
          type="button"
          disabled={!message.quotedMessageId}
          onClick={() => message.quotedMessageId && void onNavigateToMessage(message.quotedMessageId)}
          className={`mb-2 block w-full border-l-4 border-emerald-300 bg-black/15 px-2.5 py-2 text-left ${isImage || isVideo ? "rounded-xl" : "rounded-lg"} disabled:cursor-default`}
        >
          <span className="flex min-w-0 items-center gap-2">
            {quotedMediaMessage?.type === "IMAGE" && message.quotedMessageId && (
              <Image unoptimized src={`${API_URL}/messages/${message.quotedMessageId}/media`} alt="" width={36} height={36} className="size-9 shrink-0 rounded-md object-cover" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold text-emerald-200">
                {message.quotedSenderName || "Mensagem"}
              </span>
              <span className="block truncate text-xs text-white/75">{message.quotedContent}</span>
            </span>
          </span>
        </button>
      )}
      {inlineTime ? (
        <div className="flex min-w-0 items-end gap-2 pr-4">
          <div className="min-w-0">{content}</div>
          <span className="flex shrink-0 items-center gap-0.5">{timestamp}{readReceipt}</span>
        </div>
      ) : (
        content
      )}
      {message.deletedAt && (
        <motion.p
          role="note"
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          className={`mt-1.5 flex items-center gap-1.5 text-[11px] italic ${isPrivate ? "text-amber-800/65" : "text-white/55"}`}
        >
          <Trash size={12} weight="regular" aria-hidden="true" />
          <span>{message.direction === "INCOMING" ? "Apagada pelo usuário" : "Mensagem apagada"}</span>
        </motion.p>
      )}
      {!inlineTime && timestamp && (
        <div className={`flex items-center justify-end gap-0.5 ${isSticker ? "absolute right-1 bottom-1 rounded-md bg-black/55 px-1.5 py-1 shadow-sm backdrop-blur-sm" : (isImage && !imageHasCaption) || (isVideo && message.content === "[Vídeo]") ? "absolute right-2 bottom-2 rounded-full bg-black/45 px-1.5 py-1 shadow-sm backdrop-blur-[2px]" : isImage || isVideo ? "px-2 pt-0.5 pb-1" : isAudio ? "mt-2" : "mt-1"}`}>
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
