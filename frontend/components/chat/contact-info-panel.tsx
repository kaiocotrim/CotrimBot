"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pencil, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ContactPhoto } from "@/components/chat/contact-photo";
import type { Contact } from "@/types/chat";

export function ContactInfoPanel({
  contact,
  onClose,
  onSearch,
  onRenameContact,
}: {
  contact: Contact;
  onClose: () => void;
  onSearch: () => void;
  onRenameContact: (contactId: number, name: string) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    const [first = "", ...rest] = contact.name.trim().split(/\s+/);
    setFirstName(first);
    setLastName(rest.join(" "));
    setError(null);
    setEditing(true);
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !firstName.trim()) return;

    const name = `${firstName.trim()} ${lastName.trim()}`.trim().replace(/\s+/g, " ");
    setSaving(true);
    setError(null);
    try {
      await onRenameContact(contact.id, name);
      setEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível editar o contato");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.aside
      initial={reduceMotion ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: reduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Informações do contato"
      className="relative flex h-1/2 min-h-0 w-full shrink-0 flex-col overflow-hidden bg-black
        @min-[640px]:h-full @min-[640px]:w-[min(24rem,40%)]"
    >
      <header className="flex h-16 shrink-0 items-center gap-3 px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar informações"
          className="flex size-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 active:scale-95"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <h2 className="text-sm font-medium text-white">Informações do contato</h2>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <ContactPhoto contact={contact} />
        <h3 className="mt-4 max-w-full text-center text-xl font-semibold break-words text-white">{contact.name}</h3>
        <p className="mt-1 text-sm text-zinc-300/80">
          {contact.isGroup ? "Grupo do WhatsApp" : contact.phone}
        </p>

        {editing ? (
          <form
            onSubmit={saveName}
            aria-label="Editar contato"
            aria-busy={saving}
            className="mt-4 w-full space-y-4 py-4"
          >
            <label className="block text-xs text-zinc-300/80">
              Nome
              <input
                autoFocus
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs text-zinc-300/80">
              Sobrenome
              <input
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-xl px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !firstName.trim()}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="mt-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-zinc-300/80 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar contato
          </button>
        )}

        <dl className="mt-8 w-full shrink-0 space-y-5 px-1">
          <div>
            <dt className="text-xs text-zinc-400">Tipo</dt>
            <dd className="mt-1 text-sm text-white">
              {contact.isGroup ? "Grupo" : "Contato"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Telefone</dt>
            <dd className="mt-1 break-words text-sm text-white">{contact.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Status</dt>
            <dd className="mt-1 text-sm text-white">
              {contact.archived ? "Arquivado" : "Ativo"}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={onSearch}
          className="mt-7 w-full shrink-0 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-white/50 active:scale-[0.99]"
        >
          Localizar mensagem nesta conversa
        </button>
      </div>
    </motion.aside>
  );
}
