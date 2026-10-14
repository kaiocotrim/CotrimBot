"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Bot, Check, ChevronDown, LoaderCircle, MessageCircle, Pencil, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ContactPhoto } from "@/components/chat/contact-photo";
import {
  getContactAssignees,
  getGroupParticipants,
  type ContactAssignee,
  type GroupParticipant,
} from "@/lib/chat-api";
import { contactPriorities } from "@/lib/contact-priority";
import type { Contact } from "@/types/chat";

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

function formatParticipantPhone(phone: string) {
  return phone ? `+${phone}` : "Número indisponível";
}

export function ContactInfoPanel({
  contact,
  onClose,
  onSearch,
  onRenameContact,
  onSetContactAssignment,
  onSetContactPriority,
  onCloseWithBot,
  onStartConversation,
  closing,
}: {
  contact: Contact;
  onClose: () => void;
  onSearch: () => void;
  onRenameContact: (contactId: number, name: string, companyName?: string) => Promise<void>;
  onSetContactAssignment: (contactId: number, assignedUserIds: string[]) => Promise<void>;
  onSetContactPriority: (contactId: number, priority: NonNullable<Contact["priority"]>) => Promise<void>;
  onCloseWithBot: () => void;
  onStartConversation: (participant: GroupParticipant) => Promise<void>;
  closing: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<ContactAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(true);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(contact.isGroup);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [participantsReloadKey, setParticipantsReloadKey] = useState(0);
  const [startingParticipantPhone, setStartingParticipantPhone] = useState<string | null>(null);
  const [startConversationError, setStartConversationError] = useState<string | null>(null);
  const selectedPriority = contact.priority ?? "NONE";
  const assigneeMenuRef = useRef<HTMLDivElement>(null);
  const assigneeTriggerRef = useRef<HTMLButtonElement>(null);
  const assignedUserIds = contact.assignedUserIds ?? [];
  const selectedAssignees = assignees.filter((user) => assignedUserIds.includes(user.id));
  const assigneeSummary = selectedAssignees.length === 0
    ? "Não atribuído"
    : selectedAssignees.length <= 2
      ? selectedAssignees.map((user) => user.name).join(" e ")
      : `${selectedAssignees[0]?.name}, ${selectedAssignees[1]?.name} e mais ${selectedAssignees.length - 2}`;

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
    if (!contact.isGroup) return;
    let active = true;
    void getGroupParticipants(contact.id)
      .then((participants) => { if (active) setGroupParticipants(participants); })
      .catch((requestError: unknown) => {
        if (active) {
          setGroupParticipants([]);
          setParticipantsError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os participantes.");
        }
      })
      .finally(() => { if (active) setParticipantsLoading(false); });
    return () => { active = false; };
  }, [contact.id, contact.isGroup, participantsReloadKey]);

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

  async function changeAssignees(nextAssignedUserIds: string[]) {
    if (assignmentSaving) return;
    setAssignmentSaving(true);
    setAssignmentError(null);
    try {
      await onSetContactAssignment(contact.id, nextAssignedUserIds);
    } catch (requestError) {
      setAssignmentError(requestError instanceof Error ? requestError.message : "Não foi possível atribuir a conversa.");
    } finally {
      setAssignmentSaving(false);
    }
  }

  function toggleAssignee(assignedUserId: string) {
    void changeAssignees(
      assignedUserIds.includes(assignedUserId)
        ? assignedUserIds.filter((userId) => userId !== assignedUserId)
        : [...assignedUserIds, assignedUserId],
    );
  }

  async function changePriority(priority: NonNullable<Contact["priority"]>) {
    if (prioritySaving || priority === selectedPriority) return;
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

  async function startParticipantConversation(participant: GroupParticipant) {
    if (startingParticipantPhone) return;
    setStartingParticipantPhone(participant.phone);
    setStartConversationError(null);
    try {
      await onStartConversation(participant);
    } catch (requestError) {
      setStartConversationError(requestError instanceof Error ? requestError.message : "Não foi possível iniciar a conversa.");
    } finally {
      setStartingParticipantPhone(null);
    }
  }

  function startEditing() {
    const [first = "", ...rest] = contact.name.trim().split(/\s+/);
    setFirstName(first);
    setLastName(rest.join(" "));
    setCompanyName(contact.companyName ?? "");
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
      await onRenameContact(contact.id, name, companyName.trim());
      setEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível editar o contato");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.aside
      initial={reduceMotion ? false : { opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Informações do contato"
      className="absolute inset-0 z-40 flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-black
        @min-[1024px]:relative @min-[1024px]:inset-auto @min-[1024px]:z-auto @min-[1024px]:h-full @min-[1024px]:w-[min(24rem,40%)]"
    >
      <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 px-4 pt-[env(safe-area-inset-top)] @min-[1024px]:h-16 @min-[1024px]:pt-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar informações"
          className="flex size-11 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 active:scale-95 lg:size-9"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <h2 className="text-base font-medium text-white lg:text-sm">Informações do contato</h2>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ContactPhoto contact={contact} />
        <h3 className="mt-4 max-w-full text-center text-2xl font-semibold break-words text-white lg:text-xl">{contact.name}</h3>
        <p className="mt-1 text-base text-zinc-300/80 lg:text-sm">
          {contact.isGroup ? "Grupo do WhatsApp" : contact.phone}
        </p>

        {editing ? (
          <form
            onSubmit={saveName}
            aria-label="Editar contato"
            aria-busy={saving}
            className="mt-4 w-full space-y-4 py-4"
          >
            <label className="block text-sm text-zinc-300/80 lg:text-xs">
              Nome
              <input
                autoFocus
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl bg-zinc-900 px-3 py-2 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 lg:text-sm"
              />
            </label>
            <label className="block text-sm text-zinc-300/80 lg:text-xs">
              Sobrenome
              <input
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl bg-zinc-900 px-3 py-2 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 lg:text-sm"
              />
            </label>
            <label className="block text-sm text-zinc-300/80 lg:text-xs">
              Empresa
              <input
                autoComplete="organization"
                maxLength={191}
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl bg-zinc-900 px-3 py-2 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 lg:text-sm"
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
            className="mt-3 flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-sm text-zinc-300/80 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 lg:min-h-0 lg:text-xs"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar contato
          </button>
        )}

        <dl className="mt-8 w-full shrink-0 space-y-5 px-1">
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Tipo</dt>
            <dd className="mt-1 text-base text-white lg:text-sm">
              {contact.isGroup ? "Grupo" : "Contato"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Telefone</dt>
            <dd className="mt-1 break-words text-base text-white lg:text-sm">{contact.phone}</dd>
          </div>
          {contact.isGroup && <div>
            <dt className="flex items-center justify-between gap-3 text-sm text-zinc-400 lg:text-xs">
              <span>Participantes</span>
              {!participantsLoading && !participantsError && (
                <span className="tabular-nums text-zinc-500">{groupParticipants.length}</span>
              )}
            </dt>
            <dd className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
              {participantsLoading ? (
                <div role="status" aria-label="Carregando participantes" className="space-y-1 p-2">
                  {[0, 1, 2].map((item) => <div key={item} className="flex h-12 animate-pulse items-center gap-3 rounded-xl px-2 motion-reduce:animate-none">
                    <span className="size-8 rounded-full bg-white/[0.08]" />
                    <span className="h-3 w-32 rounded-full bg-white/[0.08]" />
                  </div>)}
                </div>
              ) : participantsError ? (
                <div className="px-4 py-5 text-center">
                  <p role="alert" className="text-xs text-zinc-400">{participantsError}</p>
                  <button type="button" onClick={() => {
                    setParticipantsLoading(true);
                    setParticipantsError(null);
                    setParticipantsReloadKey((current) => current + 1);
                  }} className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/40">
                    Tentar novamente
                  </button>
                </div>
              ) : groupParticipants.length === 0 ? (
                <p className="px-4 py-5 text-center text-xs text-zinc-500">Nenhum participante encontrado.</p>
              ) : (
                <ul className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {groupParticipants.map((participant) => {
                    const displayName = participant.name ?? formatParticipantPhone(participant.phone);
                    const starting = startingParticipantPhone === participant.phone;
                    return <li key={participant.phone}>
                      <button
                        type="button"
                        disabled={Boolean(startingParticipantPhone)}
                        onClick={() => void startParticipantConversation(participant)}
                        aria-label={`Iniciar conversa com ${displayName}`}
                        className="group flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.055] focus-visible:bg-white/[0.055] focus-visible:outline-2 focus-visible:outline-white/30 disabled:cursor-wait disabled:opacity-60"
                      >
                        <UserAvatar name={displayName} image={participant.profilePictureUrl} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-zinc-100">{displayName}</span>
                          {participant.name && <span className="block truncate text-[11px] text-zinc-500">{formatParticipantPhone(participant.phone)}</span>}
                        </span>
                        {participant.isAdmin && <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] font-medium text-zinc-400">Admin</span>}
                        {starting ? <LoaderCircle className="size-4 shrink-0 animate-spin text-zinc-400 motion-reduce:animate-none" aria-hidden="true" /> : <MessageCircle className="size-4 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300" aria-hidden="true" />}
                      </button>
                    </li>;
                  })}
                </ul>
              )}
            </dd>
            {startConversationError && <p role="alert" className="mt-1.5 text-xs text-red-300">{startConversationError}</p>}
          </div>}
          {!contact.isGroup && contact.companyName && <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Empresa</dt>
            <dd className="mt-1 break-words text-base text-white lg:text-sm">{contact.companyName}</dd>
          </div>}
          {!contact.isGroup && <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Responsáveis</dt>
            <dd className="mt-1">
              <button
                ref={assigneeTriggerRef}
                type="button"
                aria-label={`Responsáveis: ${assigneeSummary}`}
                aria-haspopup="menu"
                aria-expanded={assigneeOpen}
                disabled={assigneesLoading || assignmentSaving || Boolean(assignmentError && assignees.length === 0)}
                onClick={() => setAssigneeOpen((open) => !open)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-left text-base text-zinc-100 transition-colors hover:bg-white/[0.075] focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-60 lg:text-sm"
              >
                {selectedAssignees.length ? (
                  <span aria-hidden="true" className="flex shrink-0 -space-x-2">
                    {selectedAssignees.slice(0, 3).map((user) => <UserAvatar key={user.id} name={user.name} image={user.image} />)}
                  </span>
                ) : <UserAvatar name="" />}
                <span className="min-w-0 flex-1 truncate">{assigneesLoading ? "Carregando usuários..." : assigneeSummary}</span>
                <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-zinc-500 transition-transform ${assigneeOpen ? "rotate-180" : ""}`} />
              </button>
              {assigneeOpen && <div
                ref={assigneeMenuRef}
                role="menu"
                aria-label="Escolher responsáveis"
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
                <button type="button" role="menuitemcheckbox" aria-checked={assignedUserIds.length === 0} onClick={() => void changeAssignees([])} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.08] focus-visible:outline-none">
                  <UserAvatar name="" />
                  <span className="min-w-0 flex-1 truncate">Não atribuído</span>
                  {assignedUserIds.length === 0 && <Check aria-hidden="true" className="size-4 text-zinc-200" />}
                </button>
                {assignees.map((user) => <button key={user.id} type="button" role="menuitemcheckbox" aria-checked={assignedUserIds.includes(user.id)} onClick={() => toggleAssignee(user.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.08] focus-visible:outline-none">
                  <UserAvatar name={user.name} image={user.image} />
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                  {assignedUserIds.includes(user.id) && <Check aria-hidden="true" className="size-4 text-zinc-200" />}
                </button>)}
              </div>}
              {assignmentSaving && <p role="status" className="mt-1 text-xs text-zinc-400">Salvando responsáveis...</p>}
              {assignmentError && <p role="alert" className="mt-1 text-xs text-red-300">{assignmentError}</p>}
            </dd>
          </div>}
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Prioridade</dt>
            <dd className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">
              {contactPriorities.map((option) => <button
                key={option.value}
                type="button"
                aria-pressed={selectedPriority === option.value}
                disabled={prioritySaving}
                onClick={() => void changePriority(selectedPriority === option.value ? "NONE" : option.value)}
                className={`flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-60 lg:h-9 lg:text-xs ${selectedPriority === option.value ? "bg-white/[0.1] text-zinc-100 shadow-sm" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"}`}
              >
                <span aria-hidden="true" className={`size-1.5 rounded-full ${option.dot}`} />
                {option.label}
              </button>)}
            </dd>
            {priorityError && <p role="alert" className="mt-1 text-xs text-red-300">{priorityError}</p>}
          </div>
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Status</dt>
            <dd className="mt-1 text-base text-white lg:text-sm">
              {contact.archived ? "Arquivado" : "Ativo"}
            </dd>
          </div>
        </dl>

        {!contact.isGroup && (
          <button
            type="button"
            onClick={onCloseWithBot}
            disabled={closing}
            aria-busy={closing}
            className="mt-7 flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.08] px-4 py-3 text-sm font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-400/[0.13] focus-visible:outline-2 focus-visible:outline-red-300/60 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {closing ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Bot className="size-4" aria-hidden="true" />
            )}
            {closing ? "Encerrando chamado..." : "Encerrar chamado"}
          </button>
        )}

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
