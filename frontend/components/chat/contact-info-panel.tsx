"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/chat/avatar";
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
      className="absolute inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-hidden
        border-l border-white/15
        bg-zinc-900/40 backdrop-blur-2xl backdrop-saturate-150
        shadow-[0_0_60px_-10px_rgba(0,0,0,0.6),inset_1px_0_0_0_rgba(255,255,255,0.08)]"
    >
      {/* Reflexo de luz no topo (highlight do vidro) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-white/[0.10] to-transparent"
      />

      <header className="relative flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar informações"
          className="flex size-9 items-center justify-center rounded-full text-zinc-200 transition hover:bg-white/15 active:scale-95"
        >
          ✕
        </button>
        <h2 className="text-sm font-medium text-white">Informações do contato</h2>
      </header>

      <div className="relative flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <Avatar
          contact={contact}
          className="size-28 ring-1 ring-white/25 shadow-xl shadow-black/30"
        />
        <h3 className="mt-4 text-xl font-semibold text-white">{contact.name}</h3>
        <p className="mt-1 text-sm text-zinc-300/80">
          {contact.isGroup ? "Grupo do WhatsApp" : contact.phone}
        </p>

        {editing ? (
          <form
            onSubmit={saveName}
            aria-label="Editar contato"
            aria-busy={saving}
            className="mt-4 w-full space-y-4 rounded-2xl border border-white/15 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md"
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
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-white/30 focus:ring-2 focus:ring-white/[0.05] disabled:opacity-50"
              />
            </label>
            <label className="block text-xs text-zinc-300/80">
              Sobrenome
              <input
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-white/30 focus:ring-2 focus:ring-white/[0.05] disabled:opacity-50"
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
                className="rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-sm text-white transition hover:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-50"
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

        {/* Card de vidro interno */}
        <div className="mt-7 w-full overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md">
          <div className="border-b border-white/10 px-4 py-3">
            <span className="block text-xs text-zinc-300/60">Tipo</span>
            <span className="mt-1 block text-sm text-white">
              {contact.isGroup ? "Grupo" : "Contato"}
            </span>
          </div>
          <div className="border-b border-white/10 px-4 py-3">
            <span className="block text-xs text-zinc-300/60">Telefone</span>
            <span className="mt-1 block text-sm text-white">{contact.phone}</span>
          </div>
          <div className="px-4 py-3">
            <span className="block text-xs text-zinc-300/60">Status</span>
            <span className="mt-1 block text-sm text-white">
              {contact.archived ? "Arquivado" : "Ativo"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSearch}
          className="mt-4 w-full rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md transition hover:bg-white/[0.14] active:scale-[0.99]"
        >
          Localizar mensagem nesta conversa
        </button>
      </div>
    </motion.aside>
  );
}
