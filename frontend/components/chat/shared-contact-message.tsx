"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, LoaderCircle, UserRound, UserRoundPlus } from "lucide-react";
import type { Contact, SharedContact } from "@/types/chat";

function SharedContactCard({ contact, alreadySaved, onSave }: {
  contact: SharedContact;
  alreadySaved: boolean;
  onSave: (name: string, phone: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const isSaved = alreadySaved || saved;

  async function save() {
    if (saving || isSaved) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(contact.name, contact.phone);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o contato.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-64 max-w-full">
      <div className="flex items-center gap-3 px-1 py-2">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-300"><UserRound className="size-5" /></span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-zinc-100">{contact.name}</p>
          <p className="mt-0.5 break-all text-xs text-zinc-400">+{contact.phone}</p>
        </div>
      </div>
      <motion.button type="button" disabled={saving || isSaved} aria-busy={saving} aria-label={saving ? "Salvando…" : isSaved ? "Contato salvo" : "Salvar contato"} whileTap={reduceMotion || saving || isSaved ? undefined : { scale: 0.97 }} onClick={() => void save()} className="flex min-h-10 w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-zinc-200 transition-colors enabled:hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/50 disabled:cursor-default disabled:text-zinc-400">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={saving ? "saving" : isSaved ? "saved" : "idle"}
            initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -3 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 28, opacity: { duration: 0.12 } }}
            className="inline-flex items-center gap-2"
          >
            {saving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : isSaved ? <Check aria-hidden="true" className="size-4" /> : <UserRoundPlus aria-hidden="true" className="size-4" />}
            {saving ? "Salvando…" : isSaved ? "Contato salvo" : "Salvar contato"}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {isSaved && <span role="status" className="sr-only">Contato {contact.name} salvo</span>}
      {error && <p role="alert" className="px-3 py-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export function SharedContactMessage({ contacts, savedContacts, onSave }: {
  contacts: SharedContact[];
  savedContacts: Contact[];
  onSave: (name: string, phone: string) => Promise<void>;
}) {
  return (
    <div className="flex max-w-full flex-col gap-2">
      {contacts.map((contact) => <SharedContactCard key={contact.phone} contact={contact} alreadySaved={savedContacts.some((saved) => saved.isSaved && saved.phone === contact.phone)} onSave={onSave} />)}
    </div>
  );
}
