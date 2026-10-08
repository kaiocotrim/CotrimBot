"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Pencil, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ContactPhoto } from "@/components/chat/contact-photo";
import { getContactAssignees, type ContactAssignee } from "@/lib/chat-api";
import type { Contact } from "@/types/chat";

const priorities = [
  { value: "LOW", label: "Baixa", dot: "bg-emerald-400" },
  { value: "MEDIUM", label: "Média", dot: "bg-amber-400" },
  { value: "HIGH", label: "Alta", dot: "bg-rose-400" },
] as const;

function UserAvatar({ name, image }: { name: string; image?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-[11px] font-semibold text-zinc-100">
      {image && !failed ? (
        // A foto da conta pode vir de um provedor externo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : name ? name.trim().charAt(0).toLocaleUpperCase("pt-BR") : <UserRound className="size-4" />}
    </span>
  );
}

export function ContactInfoPanel({
  contact,
  onClose,
  onSearch,
  onRenameContact,
  onSetContactAssignment,
  onSetContactPriority,
}: {
  contact: Contact;
  onClose: () => void;
  onSearch: () => void;
  onRenameContact: (contactId: number, name: string) => Promise<void>;
  onSetContactAssignment: (contactId: number, assignedUserId: string | null) => Promise<void>;
  onSetContactPriority: (contactId: number, priority: NonNullable<Contact["priority"]>) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<ContactAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(true);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const assigneeMenuRef = useRef<HTMLDivElement>(null);
  const assigneeTriggerRef = useRef<HTMLButtonElement>(null);
  const selectedAssignee = assignees.find((user) => user.id === contact.assignedUserId);

  useEffect(() => {
    if (contact.isGroup) return;
    let active = true;
    void getContactAssignees()
      .then((users) => { if (active) setAssignees(users); })
      .catch((requestError: unknown) => {
        if (active) setAssignmentError(requestError instanceof Error ? requestError.message : "Não foi possível buscar os usuários.");
      })
      .finally(() => { if (active) setAssigneesLoading(false); });
    return () => { active = false; };
  }, [contact.isGroup]);

  useEffect(() => {
    if (!assigneeOpen) return;
    const frame = requestAnimationFrame(() => {
      const selected = assigneeMenuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      (selected ?? assigneeMenuRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
    });
    function handlePointerDown(event: PointerEvent) {
      if (!assigneeMenuRef.current?.contains(event.target as Node) && !assigneeTriggerRef.current?.contains(event.target as Node)) {
        setAssigneeOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAssigneeOpen(false);
      assigneeTriggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [assigneeOpen]);

  async function changeAssignee(assignedUserId: string | null) {
    if (assignmentSaving) return;
    setAssigneeOpen(false);
    setAssignmentSaving(true);
    setAssignmentError(null);
    try {
      await onSetContactAssignment(contact.id, assignedUserId);
    } catch (requestError) {
      setAssignmentError(requestError instanceof Error ? requestError.message : "Não foi possível atribuir a conversa.");
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function changePriority(priority: NonNullable<Contact["priority"]>) {
    if (prioritySaving || priority === (contact.priority ?? "MEDIUM")) return;
    setPrioritySaving(true);
    setPriorityError(null);
    try {
      await onSetContactPriority(contact.id, priority);
    } catch (requestError) {
      setPriorityError(requestError instanceof Error ? requestError.message : "Não foi possível alterar a prioridade.");
    } finally {
      setPrioritySaving(false);
    }
  }

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
          {!contact.isGroup && <div>
            <dt className="text-xs text-zinc-400">Atribuído</dt>
            <dd className="mt-1">
              <button
                ref={assigneeTriggerRef}
                type="button"
                aria-label={`Atribuído: ${selectedAssignee?.name ?? (contact.assignedUserId ? "Usuário indisponível" : "Não atribuído")}`}
                aria-haspopup="menu"
                aria-expanded={assigneeOpen}
                disabled={assigneesLoading || assignmentSaving || Boolean(assignmentError && assignees.length === 0)}
                onClick={() => setAssigneeOpen((open) => !open)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-left text-sm text-zinc-100 transition-colors hover:bg-white/[0.075] focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-60"
              >
                <UserAvatar name={selectedAssignee?.name ?? ""} image={selectedAssignee?.image} />
                <span className="min-w-0 flex-1 truncate">{assigneesLoading ? "Carregando usuários..." : selectedAssignee?.name ?? (contact.assignedUserId ? "Usuário indisponível" : "Não atribuído")}</span>
                <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-zinc-500 transition-transform ${assigneeOpen ? "rotate-180" : ""}`} />
              </button>
              {assigneeOpen && <div
                ref={assigneeMenuRef}
                role="menu"
                aria-label="Escolher responsável"
                onKeyDown={(event) => {
                  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                  const index = options.indexOf(document.activeElement as HTMLButtonElement);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
                  options[next]?.focus();
                }}
                className="mt-2 max-h-60 space-y-0.5 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.35)]"
              >
                <button type="button" role="menuitemradio" aria-checked={!contact.assignedUserId} onClick={() => void changeAssignee(null)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.08] focus-visible:outline-none">
                  <UserAvatar name="" />
                  <span className="min-w-0 flex-1 truncate">Não atribuído</span>
                  {!contact.assignedUserId && <Check aria-hidden="true" className="size-4 text-emerald-400" />}
                </button>
                {assignees.map((user) => <button key={user.id} type="button" role="menuitemradio" aria-checked={contact.assignedUserId === user.id} onClick={() => void changeAssignee(user.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.08] focus-visible:outline-none">
                  <UserAvatar name={user.name} image={user.image} />
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                  {contact.assignedUserId === user.id && <Check aria-hidden="true" className="size-4 text-emerald-400" />}
                </button>)}
              </div>}
              {assignmentSaving && <p role="status" className="mt-1 text-xs text-zinc-400">Salvando responsável...</p>}
              {assignmentError && <p role="alert" className="mt-1 text-xs text-red-300">{assignmentError}</p>}
            </dd>
          </div>}
          <div>
            <dt className="text-xs text-zinc-400">Prioridade</dt>
            <dd className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">
              {priorities.map((option) => <button
                key={option.value}
                type="button"
                aria-pressed={(contact.priority ?? "MEDIUM") === option.value}
                disabled={prioritySaving}
                onClick={() => void changePriority(option.value)}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-60 ${(contact.priority ?? "MEDIUM") === option.value ? "bg-white/[0.1] text-zinc-100 shadow-sm" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"}`}
              >
                <span aria-hidden="true" className={`size-1.5 rounded-full ${option.dot}`} />
                {option.label}
              </button>)}
            </dd>
            {priorityError && <p role="alert" className="mt-1 text-xs text-red-300">{priorityError}</p>}
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
