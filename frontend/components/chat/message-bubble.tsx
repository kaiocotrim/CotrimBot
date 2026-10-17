"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  CaretDown,
  Copy,
  PushPin,
  Smiley,
  Star,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { AudioMessage } from "@/components/chat/audio-message";
import { DocumentMessage } from "@/components/chat/document-message";
import { EmojiText } from "@/components/chat/emoji-text";
import { ImageMessage } from "@/components/chat/image-message";
import { MessageText } from "@/components/chat/message-text";
import { StickerMessage } from "@/components/chat/sticker-message";
import { SharedContactMessage } from "@/components/chat/shared-contact-message";
import { PollMessage } from "@/components/chat/poll-message";
import { TextMessage } from "@/components/chat/text-message";
import { VideoMessage } from "@/components/chat/video-message";
import type { Contact, Message } from "@/types/chat";

type MessageBubbleProps = {
  message: Message;
  quotedMessage?: Message;
  contact: Contact;
  mediaMessages: Message[];
  onReact: (messageId: number, reaction: string) => Promise<void>;
  onUpdateFlags: (messageId: number, flags: { pinned?: boolean; pinDurationHours?: 24 | 168 | 720; favorited?: boolean }) => Promise<void>;
  onDelete: (messageId: number, scope: "me" | "everyone") => Promise<void>;
  onRequestForward: (message: Message) => void;
  onReply: (message: Message) => void;
  onNavigateToMessage: (messageId: number) => Promise<void>;
  savedContacts: Contact[];
  onSaveSharedContact: (name: string, phone: string) => Promise<void>;
  onMessageSharedContact: (name: string, phone: string) => Promise<void>;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_DURATION = 500;
const LONG_PRESS_MOVE_TOLERANCE = 12;
const DESKTOP_QUERY = "(min-width: 1024px)";

function isMessageGestureTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, audio, video, canvas, [contenteditable], [role='slider'], [role='menu'], [role='dialog']")) return false;
  return !target.closest("button") || Boolean(target.closest("[data-message-media-preview]"));
}

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
export function MessageBubble({ message, quotedMessage, contact, mediaMessages, onReact, onUpdateFlags, onDelete, onRequestForward, onReply, onNavigateToMessage, savedContacts, onSaveSharedContact, onMessageSharedContact }: MessageBubbleProps) {
  const [reacting, setReacting] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDurationHours, setPinDurationHours] = useState<24 | 168 | 720>(168);
  const [deleting, setDeleting] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingFlags, setUpdatingFlags] = useState(false);
  const [pinAnimationKey, setPinAnimationKey] = useState(0);
  const actionControlsRef = useRef<HTMLDivElement>(null);
  const reactionControlsRef = useRef<HTMLDivElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const reactionTriggerRef = useRef<HTMLButtonElement>(null);
  const longPressRef = useRef<{ pointerId: number; startX: number; startY: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const lastTouchStartRef = useRef(0);
  const suppressNextClickRef = useRef(false);
  const [reactionPosition, setReactionPosition] = useState({ top: 0, left: 0 });
  const outgoing = message.direction === "OUTGOING";
  const isPrivate = Boolean(message.private);
  const showSignature = outgoing && !isPrivate;
  const isAudio = message.type === "AUDIO";
  const isImage = message.type === "IMAGE";
  const isVideo = message.type === "VIDEO";
  const isSticker = message.type === "STICKER";
  const imageHasCaption = isImage && message.content !== "[Imagem]";
  const mediaUrl = `${API_URL}/messages/${message.id}/media`;
  const quotedMediaMessage = message.quotedMessageId
    ? mediaMessages.find((media) => media.id === message.quotedMessageId)
    : undefined;
  const showQuotedSignature = quotedMessage
    ? quotedMessage.direction === "OUTGOING" && !quotedMessage.private
    : message.quotedSenderName === "Você";
  const createdAt = new Date(message.createdAt);
  const hasValidDate = !Number.isNaN(createdAt.getTime());
  const inlineTime = message.type === "TEXT" && !/[\r\n]/.test(message.content) && !message.deletedAt;
  const reduceMotion = useReducedMotion();

  // Cada caso seleciona um único componente, sem duplicar o conteúdo da mídia.
  const content = (() => {
    switch (message.type) {
      case "POLL":
        return message.poll ? <PollMessage key={message.id} messageId={message.id} poll={message.poll} /> : <TextMessage content={message.content} showSignature={false} />;
      case "CONTACT":
        return message.sharedContacts?.length ? <SharedContactMessage contacts={message.sharedContacts} savedContacts={savedContacts} onSave={onSaveSharedContact} onMessage={onMessageSharedContact} /> : <TextMessage content={message.content} showSignature={false} />;
      case "TEXT":
        return <TextMessage content={message.content} showSignature={showSignature} />;
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
          showSignature={showSignature}
          viewOnce={Boolean(message.viewOnce)}
          contact={contact}
          createdAt={message.createdAt}
          gallery={mediaMessages.filter((media) => media.type === "IMAGE").map((image) => ({
            id: image.id,
            mediaUrl: `${API_URL}/messages/${image.id}/media`,
            content: image.content,
            showSignature: image.direction === "OUTGOING" && !image.private,
            createdAt: image.createdAt,
            viewOnce: Boolean(image.viewOnce),
          }))}
        />;
      case "VIDEO":
        return <VideoMessage
          messageId={message.id}
          mediaUrl={mediaUrl}
          content={message.content}
          showSignature={showSignature}
          contact={contact}
          createdAt={message.createdAt}
          gallery={mediaMessages.map((media) => ({
            id: media.id,
            type: media.type as "IMAGE" | "VIDEO",
            mediaUrl: `${API_URL}/messages/${media.id}/media`,
            content: media.content,
            showSignature: media.direction === "OUTGOING" && !media.private,
            createdAt: media.createdAt,
          }))}
        />;
      case "STICKER":
        return <StickerMessage mediaUrl={mediaUrl} />;
      case "DOCUMENT":
        return <DocumentMessage mediaUrl={mediaUrl} content={message.content} showSignature={showSignature} />;
      default:
        return <TextMessage content={message.content} showSignature={showSignature} />;
    }
  })();

  const timestamp = hasValidDate ? (
    <time
      dateTime={message.createdAt}
      title={messageDateFormatter.format(createdAt)}
      className={`shrink-0 select-none text-[11px] leading-none font-normal tabular-nums lg:text-[9px] ${isPrivate ? "text-zinc-600" : "text-white/55"}`}
    >
      {messageTimeFormatter.format(createdAt)}
    </time>
  ) : null;

  const readReceipt = outgoing ? (
    message.deliveryStatus === "failed" ? (
      <span className={isPrivate ? "text-red-600" : "text-red-200"} title="Mensagem não enviada" aria-label="Mensagem não enviada">
        <WarningCircle size={12} weight="fill" aria-hidden="true" />
      </span>
    ) : (
      <span className={message.readAt ? isPrivate ? "text-sky-600" : "text-sky-300" : isPrivate ? "text-zinc-500" : "text-white/50"} title={message.readAt ? "Visualizada" : "Enviada"} aria-label={message.readAt ? "Mensagem visualizada" : "Mensagem enviada"}>
        <svg className="h-2.5 w-[15px]" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

  useEffect(() => () => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
  }, []);

  function cancelLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }

  function showActions() {
    setActionsOpen(true);
    setReactionPickerOpen(false);
    setCopyError(false);
    setActionError(null);
  }

  function activateLongPress() {
    if (!longPressRef.current) return;
    cancelLongPress();
    lastTouchStartRef.current = 0;
    suppressNextClickRef.current = true;
    showActions();
  }

  function onMessagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    suppressNextClickRef.current = false;
    lastTouchStartRef.current = 0;
    if (window.matchMedia(DESKTOP_QUERY).matches || !event.isPrimary || event.button !== 0 || !["touch", "pen"].includes(event.pointerType)) return;
    if (!isMessageGestureTarget(event.target)) return;
    cancelLongPress();
    lastTouchStartRef.current = Date.now();
    const pointerId = event.pointerId;
    const timer = setTimeout(() => {
      if (longPressRef.current?.pointerId === pointerId) activateLongPress();
    }, LONG_PRESS_DURATION);
    longPressRef.current = { pointerId, startX: event.clientX, startY: event.clientY, timer };
  }

  function onMessagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const press = longPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > LONG_PRESS_MOVE_TOLERANCE) {
      cancelLongPress();
      lastTouchStartRef.current = 0;
    }
  }

  function openReactionPicker(triggerElement: HTMLElement | null = reactionTriggerRef.current) {
    const trigger = triggerElement?.getBoundingClientRect();
    if (!trigger) return;
    const pickerWidth = 250;
    const pickerHeight = 42;
    const gap = 4;
    const left = outgoing ? trigger.left : trigger.right - pickerWidth;
    setReactionPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - pickerWidth - 8)),
      top: trigger.top >= pickerHeight + gap + 8
        ? trigger.top - pickerHeight - gap
        : Math.max(8, Math.min(trigger.bottom + gap, window.innerHeight - pickerHeight - 8)),
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

  async function updateFlag(flags: { pinned?: boolean; pinDurationHours?: 24 | 168 | 720; favorited?: boolean }) {
    if (updatingFlags) return;
    setUpdatingFlags(true);
    setActionError(null);
    if (flags.pinned) setPinAnimationKey((key) => key + 1);
    try {
      await onUpdateFlags(message.id, flags);
      setActionsOpen(false);
      if (flags.pinned) setPinDialogOpen(false);
    } catch {
      setActionError("Não foi possível atualizar a mensagem");
    } finally {
      setUpdatingFlags(false);
    }
  }

  async function deleteSelected(scope: "me" | "everyone") {
    if (deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await onDelete(message.id, scope);
      setActionsOpen(false);
      setDeleteDialogOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível apagar a mensagem");
    } finally {
      setDeleting(false);
    }
  }

  const quickReactionBar = (
    <div className="flex w-max items-center gap-0.5 rounded-full border border-white/10 bg-zinc-900/80 px-1.5 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl">
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

  const menuButtonClass = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none lg:py-2";

  return (
    <div
      data-message-bubble
      onContextMenu={(event) => {
        if (!isMessageGestureTarget(event.target)) return;
        event.preventDefault();
        if (event.button === 2 || window.matchMedia(DESKTOP_QUERY).matches) showActions();
        else if (longPressRef.current) activateLongPress();
        else if (lastTouchStartRef.current && Date.now() - lastTouchStartRef.current < 1_500) {
          lastTouchStartRef.current = 0;
          suppressNextClickRef.current = true;
          showActions();
        }
      }}
      onPointerDown={onMessagePointerDown}
      onPointerMove={onMessagePointerMove}
      onPointerUp={(event) => { if (longPressRef.current?.pointerId === event.pointerId) cancelLongPress(); }}
      onPointerCancel={(event) => { if (longPressRef.current?.pointerId === event.pointerId) cancelLongPress(); }}
      onClickCapture={(event) => {
        lastTouchStartRef.current = 0;
        if (!suppressNextClickRef.current) return;
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      className={`group/message relative min-w-0 max-w-[86%] text-base leading-[1.45] transition-[background-color,box-shadow] duration-300 lg:max-w-[min(62%,620px)] lg:text-[13.5px] lg:leading-[1.4] font-normal [overflow-wrap:anywhere] ${isPrivate ? "text-zinc-900" : "text-white"} ${message.reaction ? "mb-3" : ""} ${
        isPrivate
          ? "rounded-[24px] bg-zinc-100 px-3.5 py-2.5 shadow-[0_4px_16px_rgba(24,24,27,0.12)]"
          : isSticker
          ? "overflow-visible bg-transparent p-0"
          : message.type === "CONTACT"
          ? "rounded-[20px] bg-zinc-800 p-3"
          : isAudio
          ? "relative w-[min(380px,70vw)] overflow-visible sm:w-[min(380px,62vw)] rounded-[24px] bg-zinc-800 px-3.5 py-3"
          : isVideo
            ? `rounded-[20px] p-[3px] shadow-[0_3px_12px_rgba(0,0,0,0.16)] bg-zinc-800`
          : isImage
            ? `rounded-[18px] p-[3px] shadow-[0_3px_12px_rgba(0,0,0,0.16)] bg-zinc-800`
            : `rounded-[24px] px-3.5 py-2.5 bg-zinc-800`
      } ${message.favorited ? "!bg-amber-300/[0.10] shadow-[0_8px_24px_rgba(245,158,11,0.08)]" : ""}`}
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
      {isPrivate && (
        <div className="mb-1 flex items-center gap-1 text-xs font-semibold tracking-wide text-zinc-600 lg:text-[10px]">
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <span>Privado</span>
        </div>
      )}
      {contact.isGroup && !outgoing && message.senderName && (
        <p className={`${isImage || isVideo ? "px-3 pt-2 pb-2" : "mb-1"} pr-5 text-[13px] font-semibold leading-tight text-emerald-300 lg:text-[11px]`}>
          {message.senderName}
        </p>
      )}
      <div ref={reactionControlsRef} className={`absolute top-1/2 z-50 hidden -translate-y-1/2 lg:block ${outgoing ? "-left-6" : "-right-6"}`}>
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
              className={`fixed z-[100] ${outgoing ? "origin-bottom-left" : "origin-bottom-right"}`}
              style={reactionPosition}
            >
              {quickReactionBar}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <div ref={actionControlsRef} className="absolute top-1 right-1 z-40 lg:top-1.5 lg:right-2">
        <button
          type="button"
          aria-label="Ações da mensagem"
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          onClick={() => {
            setActionsOpen((open) => !open);
            setReactionPickerOpen(false);
            setCopyError(false);
            setActionError(null);
          }}
          className={`flex size-8 items-center justify-center rounded-full transition-[opacity,transform,color] duration-150 focus-visible:opacity-100 focus-visible:outline-2 [@media(hover:none)]:opacity-100 lg:size-5 ${isPrivate ? "text-zinc-500 hover:text-zinc-800 focus-visible:outline-zinc-500/60" : "text-zinc-300 hover:text-white focus-visible:outline-white/50"} ${actionsOpen ? "opacity-100" : "opacity-0 group-hover/message:opacity-100"}`}
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
            className={`absolute top-9 flex min-w-[210px] flex-col lg:top-7 lg:min-w-[178px] ${outgoing ? "right-0 origin-top-right items-end" : "left-0 origin-top-left items-start"}`}
          >
            <div role="menu" aria-label="Ações da mensagem" className="w-[210px] overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 p-1 text-sm font-medium leading-tight text-zinc-100 shadow-xl backdrop-blur-xl lg:w-[178px] lg:text-[12px]">
              <>
                  <button type="button" role="menuitem" onClick={() => { onReply(message); setActionsOpen(false); }} className={menuButtonClass}>
                    <ArrowBendUpLeft size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Responder</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => void copyMessage()} disabled={!message.content} className={`${menuButtonClass} disabled:opacity-40`}>
                    <Copy size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Copiar</span>
                  </button>
                  <button type="button" role="menuitem" onClick={(event) => openReactionPicker(event.currentTarget)} className={menuButtonClass}>
                    <Smiley size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Reagir</span>
                  </button>
                  {message.content && (
                    <button type="button" role="menuitem" onClick={() => { setActionsOpen(false); onRequestForward(message); }} className={menuButtonClass}>
                      <ArrowBendUpRight size={15} weight="bold" className="shrink-0 text-zinc-200" />
                      <span>Encaminhar</span>
                    </button>
                  )}
                  <button type="button" role="menuitem" disabled={updatingFlags} onClick={() => {
                    if (message.pinned) {
                      void updateFlag({ pinned: false });
                      return;
                    }
                    setActionsOpen(false);
                    setActionError(null);
                    setPinDurationHours(168);
                    setPinDialogOpen(true);
                  }} className={`${menuButtonClass} disabled:opacity-50`}>
                    <PushPin size={15} weight={message.pinned ? "fill" : "bold"} className="shrink-0 text-zinc-200" />
                    <span>{message.pinned ? "Desafixar" : "Fixar"}</span>
                  </button>
                  <button type="button" role="menuitem" disabled={updatingFlags} onClick={() => void updateFlag({ favorited: !message.favorited })} className={`${menuButtonClass} disabled:opacity-50`}>
                    <Star size={15} weight={message.favorited ? "fill" : "bold"} className="shrink-0 text-zinc-200" />
                    <span>{message.favorited ? "Desfavoritar" : "Favoritar"}</span>
                  </button>
                  <div className="my-1 border-t border-white/10" />
                  <button type="button" role="menuitem" aria-haspopup="dialog" onClick={() => { setActionsOpen(false); setActionError(null); setDeleteDialogOpen(true); }} className={menuButtonClass}>
                    <Trash size={15} weight="bold" className="shrink-0 text-zinc-200" />
                    <span>Apagar</span>
                  </button>
                  {copyError && <p role="alert" className="px-3 py-1 text-[11px] text-red-300">Não foi possível copiar</p>}
                  {actionError && <p role="alert" className="px-3 py-1 text-[11px] text-red-300">{actionError}</p>}
              </>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
      {pinDialogOpen && (
        <Dialog.Root open onOpenChange={(open) => {
          if (updatingFlags) return;
          setPinDialogOpen(open);
          if (!open) setActionError(null);
        }}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
            <div className="pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-4">
              <Dialog.Popup className="pointer-events-auto w-full max-w-[420px] rounded-3xl border border-white/10 bg-zinc-900 p-6 text-zinc-100 shadow-[0_28px_90px_rgba(0,0,0,0.65)] outline-none transition-[opacity,transform] duration-200 data-[ending-style]:translate-y-2 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
                <Dialog.Title className="max-w-[340px] text-lg font-semibold leading-6 tracking-[-0.01em]">
                  Por quanto tempo deseja fixar esta mensagem?
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-zinc-400">
                  Você pode desafixá-la quando quiser.
                </Dialog.Description>

                <div className="mt-6 space-y-1" role="radiogroup" aria-label="Tempo de fixação">
                  {([
                    [24, "24 horas"],
                    [168, "7 dias"],
                    [720, "30 dias"],
                  ] as const).map(([hours, label]) => {
                    const selected = pinDurationHours === hours;
                    return (
                      <button key={hours} type="button" role="radio" aria-checked={selected} onClick={() => setPinDurationHours(hours)} className={`flex h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-white/50 ${selected ? "bg-white/[0.06] text-white" : "text-zinc-300 hover:bg-white/[0.035]"}`}>
                        <span className={`flex size-5 items-center justify-center rounded-full border ${selected ? "border-white" : "border-zinc-600"}`}>
                          {selected && <span className="size-2.5 rounded-full bg-white" />}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-7 flex justify-end gap-2">
                  <button type="button" disabled={updatingFlags} onClick={() => setPinDialogOpen(false)} className="h-10 rounded-xl px-4 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="button" disabled={updatingFlags} onClick={() => void updateFlag({ pinned: true, pinDurationHours })} className="h-10 rounded-xl bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-white/60 active:scale-[0.99] disabled:opacity-50">
                    {updatingFlags ? "Fixando…" : "Fixar"}
                  </button>
                </div>
                {actionError && <p role="alert" className="mt-3 text-right text-xs text-red-300">{actionError}</p>}
              </Dialog.Popup>
            </div>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {deleteDialogOpen && (
        <Dialog.Root open onOpenChange={(open) => {
          if (deleting) return;
          setDeleteDialogOpen(open);
          if (!open) setActionError(null);
        }}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
            <div className="pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-4">
              <Dialog.Popup className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 p-5 text-zinc-100 shadow-[0_28px_90px_rgba(0,0,0,0.65)] outline-none transition-[opacity,transform] duration-200 data-[ending-style]:translate-y-2 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
                <div className="flex flex-col items-center text-center">
                  <div className="flex size-11 items-center justify-center rounded-full bg-red-500/10 text-red-300">
                    <Trash size={20} weight="regular" aria-hidden="true" />
                  </div>
                  <Dialog.Title className="mt-4 text-base font-semibold tracking-[-0.01em]">Apagar mensagem?</Dialog.Title>
                  <Dialog.Description className="mt-1 text-xs text-zinc-400">
                    Essa ação não poderá ser desfeita.
                  </Dialog.Description>
                </div>
                <div className="mt-5 flex flex-col gap-2">
                  <button type="button" disabled={deleting} onClick={() => void deleteSelected("me")} className="flex h-11 w-full items-center justify-center rounded-xl bg-white/[0.07] px-4 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.11] focus-visible:outline-2 focus-visible:outline-white/60 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50">
                    Apagar para mim
                  </button>
                  {!message.deletedAt && (
                    <button type="button" disabled={deleting} onClick={() => void deleteSelected("everyone")} className="flex h-11 w-full items-center justify-center rounded-xl bg-red-500/12 px-4 text-sm font-medium text-red-200 transition hover:bg-red-500/18 focus-visible:outline-2 focus-visible:outline-red-300/60 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50">
                      Apagar para todos
                    </button>
                  )}
                </div>
                {deleting && <p role="status" className="mt-3 text-center text-xs text-zinc-400">Apagando mensagem…</p>}
                {actionError && <p role="alert" className="mt-3 rounded-xl border border-red-400/15 bg-red-500/[0.06] px-3 py-2 text-center text-xs text-red-300">{actionError}</p>}
              </Dialog.Popup>
            </div>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {!message.deletedAt && message.quotedContent && (
        <button
          type="button"
          disabled={!message.quotedMessageId}
          onClick={() => message.quotedMessageId && void onNavigateToMessage(message.quotedMessageId)}
          className={`mb-2 block w-full border-l-4 px-2.5 py-2 text-left ${isPrivate ? "border-zinc-400 bg-zinc-200/70" : "border-emerald-300 bg-black/15"} ${isImage || isVideo ? "rounded-xl" : "rounded-lg"} disabled:cursor-default`}
        >
          <span className="flex min-w-0 items-center gap-2">
            {quotedMediaMessage?.type === "IMAGE" && message.quotedMessageId && (
              <Image unoptimized src={`${API_URL}/messages/${message.quotedMessageId}/media`} alt="" width={36} height={36} className="size-9 shrink-0 rounded-md object-cover" />
            )}
            <span className="min-w-0">
              <span className={`block truncate text-[11px] font-semibold ${isPrivate ? "text-zinc-700" : "text-emerald-200"}`}>
                {message.quotedSenderName || "Mensagem"}
              </span>
              <span className={`block truncate text-xs ${isPrivate ? "text-zinc-600" : "text-white/75"}`}><MessageText content={message.quotedContent} showSignature={showQuotedSignature} linkify={false} /></span>
            </span>
          </span>
        </button>
      )}
      {message.deletedAt ? null : inlineTime ? (
        <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0">{content}</div>
          <span className="-mr-1 -mb-1 ml-auto flex shrink-0 items-center gap-0.5">
            <AnimatePresence initial={false}>
              {message.pinned && (
                <motion.span key="pinned-inline" initial={reduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.4 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 25, scale: 0.5 }} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 650, damping: 20 }} className="flex text-amber-300" title="Mensagem fixada">
                  <PushPin size={9} weight="fill" aria-hidden="true" />
                </motion.span>
              )}
              {message.favorited && (
                <motion.span key="favorite-inline" initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.75 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="flex text-amber-300" title="Mensagem favorita">
                  <Star size={9} weight="fill" aria-hidden="true" />
                </motion.span>
              )}
            </AnimatePresence>
            {timestamp}{readReceipt}
          </span>
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
          className={`mt-1.5 flex items-center gap-1.5 text-[11px] italic ${isPrivate ? "text-zinc-600" : "text-white/55"}`}
        >
          <Trash size={12} weight="regular" aria-hidden="true" />
          <span>{message.direction === "INCOMING" ? "Apagada pelo usuário" : "Mensagem apagada"}</span>
        </motion.p>
      )}
      {!inlineTime && timestamp && (
        <div className={`flex items-center justify-end gap-0.5 ${isSticker ? "absolute right-1 bottom-1 rounded-md bg-black/55 px-1.5 py-0.5 shadow-sm backdrop-blur-sm" : (isImage && !imageHasCaption) || (isVideo && message.content === "[Vídeo]") ? "absolute right-2 bottom-2 rounded-full bg-black/45 px-1.5 py-0.5 shadow-sm backdrop-blur-[2px]" : isImage || isVideo ? "px-2 pt-0.5 pb-1" : "-mr-1 -mb-1 mt-1"}`}>
          <AnimatePresence initial={false}>
            {message.pinned && (
              <motion.span key="pinned-footer" initial={reduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.4 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 25, scale: 0.5 }} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 650, damping: 20 }} className="flex text-amber-300" title="Mensagem fixada">
                <PushPin size={9} weight="fill" aria-hidden="true" />
              </motion.span>
            )}
            {message.favorited && (
              <motion.span key="favorite-footer" initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.75 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="flex text-amber-300" title="Mensagem favorita">
                <Star size={9} weight="fill" aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>
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
