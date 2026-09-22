"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Avatar } from "@/components/chat/avatar";
import { EmojiText } from "@/components/chat/emoji-text";
import type { Contact } from "@/types/chat";

type ImageMessageProps = {
  messageId: number;
  mediaUrl: string;
  content: string;
  contact: Contact;
  createdAt: string;
  gallery: Array<{ id: number; mediaUrl: string; content: string; createdAt: string }>;
};

const viewerDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const viewerButtonClass = "flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-zinc-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_6px_18px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-white/50";
const viewerIconButtonClass = "flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-white/50";
const sideButtonClass = "absolute flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-zinc-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_22px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-white/50";

export function ImageMessage({ messageId, mediaUrl, content, contact, createdAt, gallery }: ImageMessageProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const hasCaption = content !== "[Imagem]";
  const fallbackItem = { id: messageId, mediaUrl, content, createdAt };
  const activeItem = gallery[activeIndex] ?? fallbackItem;
  const activeHasCaption = activeItem.content !== "[Imagem]";

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(3, value + 0.25));
      if (event.key === "-") setZoom((value) => Math.max(0.5, value - 0.25));
      if (event.key === "ArrowLeft" && gallery.length > 1) {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + gallery.length) % gallery.length);
        setZoom(1);
      }
      if (event.key === "ArrowRight" && gallery.length > 1) {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % gallery.length);
        setZoom(1);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [gallery.length, open]);

  function closeViewer() {
    setOpen(false);
  }

  function openViewer() {
    const index = gallery.findIndex((item) => item.id === messageId);
    setActiveIndex(index >= 0 ? index : 0);
    setZoom(1);
    setOpen(true);
  }

  function selectImage(index: number) {
    setActiveIndex(index);
    setZoom(1);
  }

  const viewer = (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Imagem enviada por ${contact.name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="fixed inset-0 z-[2147483646] flex flex-col bg-[#111312]/98 text-white"
        >
          <header className="flex h-16 shrink-0 items-center gap-3 px-5">
            <Avatar contact={contact} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{contact.name}</p>
              <p className="text-[11px] text-zinc-400">{viewerDateFormatter.format(new Date(activeItem.createdAt))}</p>
            </div>
            <div className="ml-auto flex h-11 items-center rounded-full border border-white/10 bg-white/[0.035] px-1 text-zinc-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-xl">
              <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} aria-label="Diminuir zoom" className={viewerIconButtonClass}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M7.5 10.5h6M15.5 15.5 21 21" /></svg></button>
              <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} aria-label="Aumentar zoom" className={viewerIconButtonClass}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M10.5 7.5v6M7.5 10.5h6M15.5 15.5 21 21" /></svg></button>
              <a href={activeItem.mediaUrl} download aria-label="Baixar imagem" className={viewerIconButtonClass}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 20h14" /></svg></a>
              <button type="button" onClick={closeViewer} aria-label="Fechar visualizador" className={viewerIconButtonClass}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg></button>
            </div>
          </header>

          <div onClick={closeViewer} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-4">
            <motion.div
              key={activeItem.id}
              onClick={(event) => event.stopPropagation()}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: zoom }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-full max-h-[calc(100dvh-9rem)] w-full max-w-[calc(100vw-5rem)] items-center justify-center"
            >
              <img
                src={activeItem.mediaUrl}
                alt={activeHasCaption ? activeItem.content : "Imagem recebida"}
                draggable={false}
                className="h-full w-full object-contain shadow-2xl"
              />
            </motion.div>
            {gallery.length > 1 && (
              <>
                <button type="button" onClick={(event) => { event.stopPropagation(); selectImage((activeIndex - 1 + gallery.length) % gallery.length); }} aria-label="Imagem anterior" className={`${sideButtonClass} left-5`}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); selectImage((activeIndex + 1) % gallery.length); }} aria-label="Próxima imagem" className={`${sideButtonClass} right-5`}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>
              </>
            )}
          </div>

          {activeHasCaption && <p className="shrink-0 px-6 py-2 text-center text-xs text-zinc-300"><EmojiText content={activeItem.content} /></p>}
          {gallery.length > 1 && (
            <div className="flex h-20 shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-white/10 px-4 py-2">
              <a href={activeItem.mediaUrl} download aria-label="Baixar imagem atual" className={`${viewerButtonClass} shrink-0`}><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 20h14" /></svg></a>
              {gallery.map((item, index) => (
                <button key={item.id} type="button" onClick={() => selectImage(index)} aria-label={`Abrir imagem ${index + 1}`} aria-current={index === activeIndex} className={`h-14 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-black/30 p-0.5 transition-colors ${index === activeIndex ? "border-emerald-400" : "border-transparent hover:border-white/30"}`}>
                  {/* URL autenticada e dinâmica do backend; não passa pelo otimizador do Next. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.mediaUrl} alt="" loading="lazy" className="h-full w-full rounded-[3px] object-cover" />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-2">
      <button type="button" onClick={(event) => { event.stopPropagation(); openViewer(); }} aria-label="Abrir imagem" className="block overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">
        <motion.img
          src={mediaUrl}
          alt={hasCaption ? content : "Imagem recebida"}
          loading="lazy"
          className="max-h-[320px] max-w-full object-contain transition-transform duration-200 hover:scale-[1.015]"
        />
      </button>
      {hasCaption && <p className="whitespace-pre-wrap"><EmojiText content={content} /></p>}
      {typeof document !== "undefined" && createPortal(viewer, document.body)}
    </div>
  );
}
