"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import { Avatar } from "@/components/chat/avatar";
import { EmojiText } from "@/components/chat/emoji-text";
import type { Contact, Message } from "@/types/chat";

type QuickConversationPreviewProps = {
  contact: Contact | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpenConversation: (contact: Contact) => void;
};

function senderLabel(message: Message, contact: Contact) {
  if (message.direction === "OUTGOING") return "Você";
  if (contact.isGroup && message.senderName) return message.senderName;
  return contact.name;
}

export function QuickConversationPreview({ contact, messages, loading, error, panelRef, onClose, onOpenConversation }: QuickConversationPreviewProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {contact && (
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-30 sm:absolute sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-[calc(100%+12px)] sm:w-[340px] sm:max-w-[calc(100vw-344px)] sm:-translate-y-1/2">
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby="conversation-preview-title"
            initial={reduceMotion ? false : { opacity: 0, x: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -6, scale: 0.985 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto overflow-hidden rounded-[24px] border border-white/[0.14] bg-gradient-to-b from-white/[0.11] via-zinc-900/70 to-zinc-950/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_22px_65px_rgba(0,0,0,0.46),0_4px_18px_rgba(0,0,0,0.22)] ring-1 ring-black/20 backdrop-blur-[28px] backdrop-saturate-150"
          >
            <header className="flex items-center gap-3 border-b border-white/[0.09] bg-white/[0.025] px-4 py-3.5">
              <Avatar contact={contact} className="size-9" />
              <div className="min-w-0 flex-1">
                <h2 id="conversation-preview-title" className="truncate text-[14px] font-medium tracking-[-0.01em] text-zinc-50">
                  {contact.name}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {contact.isGroup ? "Grupo do WhatsApp" : contact.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar prévia"
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-zinc-400/70 transition-colors hover:bg-white/[0.09] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-white/40"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </header>

            <div className="min-h-52 px-4 py-3.5">
              {loading && (
                <div className="space-y-3" aria-label="Carregando prévia">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className={`animate-pulse ${item % 2 ? "ml-10" : "mr-10"}`}>
                      <div className="mb-1 h-2 w-14 rounded-full bg-white/[0.07]" />
                      <div className="h-8 rounded-lg bg-white/[0.045]" />
                    </div>
                  ))}
                </div>
              )}
              {!loading && error && (
                <p role="alert" className="flex min-h-44 items-center justify-center px-5 text-center text-[12px] leading-relaxed text-red-300/80">
                  {error}
                </p>
              )}
              {!loading && !error && messages.length === 0 && (
                <p className="flex min-h-44 items-center justify-center text-[12px] text-zinc-500">Nenhuma mensagem nesta conversa</p>
              )}
              {!loading && !error && messages.length > 0 && (
                <div className="space-y-2.5">
                  {messages.map((message) => {
                    const outgoing = message.direction === "OUTGOING";
                    return (
                      <div key={message.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] ${outgoing ? "text-right" : "text-left"}`}>
                          <p className={`mb-0.5 text-[10px] font-medium ${outgoing ? "text-emerald-400/75" : "text-zinc-500"}`}>
                            {senderLabel(message, contact)}
                          </p>
                          <p className={`line-clamp-2 rounded-xl border px-3 py-2 text-[12px] leading-[1.35] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${outgoing ? "rounded-br-sm border-emerald-300/[0.06] bg-emerald-500/[0.13] text-zinc-100" : "rounded-bl-sm border-white/[0.05] bg-white/[0.07] text-zinc-200"}`}>
                            <EmojiText content={message.deletedAt ? "Mensagem apagada" : message.content} />
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="border-t border-white/[0.09] bg-black/[0.08] p-2.5">
              <button
                type="button"
                onClick={() => onOpenConversation(contact)}
                className="flex h-9 w-full items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.035] text-[12px] font-medium text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/40"
              >
                Abrir conversa
              </button>
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
