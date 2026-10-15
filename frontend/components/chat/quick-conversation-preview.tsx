"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import { Avatar } from "@/components/chat/avatar";
import { MessageText } from "@/components/chat/message-text";
import { systemMessageLabel } from "@/lib/system-message";
import type { Contact, Message } from "@/types/chat";

type QuickConversationPreviewProps = {
  contact: Contact | null;
  userId: string;
  messages: Message[];
  loading: boolean;
  error: string | null;
  panelRef: RefObject<HTMLElement | null>;
  onOpenConversation: (contact: Contact) => void;
};

export function QuickConversationPreview({ contact, userId, messages, loading, error, panelRef, onOpenConversation }: QuickConversationPreviewProps) {
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
            <header className="flex items-center gap-3 px-4 pt-4 pb-1">
              <Avatar contact={contact} className="size-9" />
              <h2 id="conversation-preview-title" className="min-w-0 truncate text-[14px] font-medium tracking-[-0.01em] text-zinc-50">
                {contact.name}
              </h2>
            </header>

            <div className="min-h-52 px-4 py-3.5" aria-busy={loading}>
              {loading && (
                <div role="status" className="flex min-h-44 items-center justify-center gap-2 text-white">
                  <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white motion-reduce:animate-none" />
                  <span className="text-[12px]">Carregando prévia...</span>
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
                        <p className={`line-clamp-2 max-w-[88%] rounded-xl bg-zinc-800 px-3 py-2 text-[12px] leading-[1.35] text-white ${outgoing ? "rounded-br-sm" : "rounded-bl-sm"}`}>
                          <MessageText content={message.deletedAt ? "Mensagem apagada" : message.type === "SYSTEM" ? systemMessageLabel(message.content, userId) : message.content} showSignature={outgoing && !message.deletedAt && !message.private} linkify={false} />
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="px-2.5 pb-2.5">
              <button
                type="button"
                onClick={() => onOpenConversation(contact)}
                className="flex h-9 w-full items-center justify-center rounded-xl bg-white/[0.035] text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/40"
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
