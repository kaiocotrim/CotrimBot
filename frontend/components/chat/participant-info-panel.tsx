"use client";

import headerStyles from "./contact-info-header.module.css";

import { motion, useReducedMotion } from "framer-motion";
import { Building2, MessageCircle, Phone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ContactPhoto } from "@/components/chat/contact-photo";
import type { GroupParticipant } from "@/lib/chat-api";
import type { Contact } from "@/types/chat";

export type ParticipantProfile = {
  participant: GroupParticipant;
  savedContact?: Contact;
};

export function ParticipantInfoPanel({ profile, groupName, onClose, onStartConversation }: {
  profile: ParticipantProfile;
  groupName: string;
  onClose: () => void;
  onStartConversation: (participant: GroupParticipant) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { participant, savedContact } = profile;
  const name = savedContact?.name || participant.name || (participant.phone ? `+${participant.phone}` : "Participante");
  const photoContact: Contact = {
    id: savedContact?.id ?? 0,
    name,
    phone: participant.phone,
    isGroup: false,
    isSaved: Boolean(savedContact?.isSaved),
    archived: false,
    unreadCount: 0,
    profilePictureUrl: savedContact?.profilePictureUrl ?? participant.profilePictureUrl,
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  async function startConversation() {
    if (starting || !participant.phone) return;
    setStarting(true);
    setError(null);
    try {
      await onStartConversation({ ...participant, name });
    } catch {
      setError("Não foi possível abrir a conversa. Tente novamente.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <motion.aside
      aria-label={`Informações de ${name}`}
      initial={reduceMotion ? false : { opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 z-40 flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-[#09090b] @min-[1024px]:relative @min-[1024px]:inset-auto @min-[1024px]:z-auto @min-[1024px]:w-[min(24rem,40%)]"
    >
      <header className={`${headerStyles.header} flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 px-4 pt-[env(safe-area-inset-top)] @min-[1024px]:h-16 @min-[1024px]:pt-0`}>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar informações do participante" className="flex size-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/50">
          <X aria-hidden="true" className="size-4" />
        </button>
        <h2 className="text-sm font-normal text-zinc-200">Informações do contato</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <div className="flex flex-col items-center pt-6 pb-8">
          <ContactPhoto contact={photoContact} />
          <h3 className="mt-4 max-w-full text-center text-xl font-normal break-words text-zinc-100">{name}</h3>
          <p className="mt-2 text-center text-xs leading-5 text-zinc-500">{participant.isAdmin ? "Admin" : "Participante"} de {groupName}</p>
        </div>
        <dl className="space-y-6 border-t border-white/[0.06] py-6">
          <div className="flex items-start gap-3">
            <Phone aria-hidden="true" className="mt-0.5 size-4 text-zinc-500" strokeWidth={1.8} />
            <div><dt className="text-xs text-zinc-500">WhatsApp</dt><dd className="mt-1 text-sm text-zinc-300">{participant.phone ? `+${participant.phone}` : "Número indisponível"}</dd></div>
          </div>
          {savedContact?.companyName && <div className="flex items-start gap-3">
            <Building2 aria-hidden="true" className="mt-0.5 size-4 text-zinc-500" strokeWidth={1.8} />
            <div><dt className="text-xs text-zinc-500">Empresa</dt><dd className="mt-1 text-sm text-zinc-300">{savedContact.companyName}</dd></div>
          </div>}
          {savedContact?.jobTitle && <div className="pl-7"><dt className="text-xs text-zinc-500">Cargo</dt><dd className="mt-1 text-sm text-zinc-300">{savedContact.jobTitle}</dd></div>}
        </dl>
        {participant.phone && <button type="button" disabled={starting} onClick={() => void startConversation()} className="flex w-full items-center justify-center gap-2 py-3 text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-50">
          <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.8} />
          {starting ? "Abrindo conversa…" : "Conversar"}
        </button>}
        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      </div>
    </motion.aside>
  );
}
