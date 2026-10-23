"use client";

import headerStyles from "./contact-info-header.module.css";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Bot, Building2, Check, ChevronDown, ExternalLink, Link2, LoaderCircle, MessageCircle, Pencil, UserRound, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContactPhoto } from "@/components/chat/contact-photo";
import { ContactMediaBrowser, ContactMediaSummary } from "@/components/chat/contact-media";
import {
  getContactAssignees,
  getGroupParticipants,
  type ContactAssignee,
  type GroupParticipant,
} from "@/lib/chat-api";
import { contactPriorities } from "@/lib/contact-priority";
import type { Contact } from "@/types/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type RegisteredCompany = { id: string; name: string; image: string | null; links: string[] };
const JOB_TITLE_OPTIONS = ["T.I", "Operador", "Supervisor"] as const;

function formatContactPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  if (!digits.startsWith("55") || digits.length > 13) return digits;
  const country = digits.slice(0, 2);
  const area = digits.slice(2, 4);
  const number = digits.slice(4);
  const prefixLength = number.length > 8 ? 5 : 4;
  const subscriber = number.length > prefixLength
    ? `${number.slice(0, prefixLength)}-${number.slice(prefixLength)}`
    : number;
  return [country, area, subscriber].filter(Boolean).join(" ");
}

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

function AssigneeOption({ name, image, avatarName = name, checked, onClick }: {
  name: string;
  image?: string | null;
  avatarName?: string;
  checked: boolean;
  onClick: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-200 transition-colors motion-reduce:transition-none hover:bg-white/[0.07] focus-visible:bg-white/[0.08] focus-visible:outline-none ${checked ? "bg-white/[0.06]" : ""}`}
    >
      <UserAvatar name={avatarName} image={image} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center">
        <AnimatePresence initial={false}>
          {checked && <motion.span
            key="checked"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 450, damping: 25 }}
            className="flex"
          ><Check className="size-4 text-zinc-200" /></motion.span>}
        </AnimatePresence>
      </span>
    </motion.button>
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
  onRenameContact: (contactId: number, name: string, companyName?: string, jobTitle?: string, phone?: string) => Promise<void>;
  onSetContactAssignment: (contactId: number, assignedUserIds: string[]) => Promise<void>;
  onSetContactPriority: (contactId: number, priority: NonNullable<Contact["priority"]>) => Promise<void>;
  onCloseWithBot: () => void;
  onStartConversation: (participant: GroupParticipant) => Promise<void>;
  closing: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [registeredCompanies, setRegisteredCompanies] = useState<RegisteredCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [activeCompanyIndex, setActiveCompanyIndex] = useState(0);
  const [jobTitle, setJobTitle] = useState("");
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [activeJobIndex, setActiveJobIndex] = useState(0);
  const [phone, setPhone] = useState("");
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
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const mediaTriggerRef = useRef<HTMLDivElement>(null);
  const assignedUserIds = contact.assignedUserIds ?? [];
  const selectedAssignees = assignees.filter((user) => assignedUserIds.includes(user.id));
  const assigneeSummary = selectedAssignees.length === 0
    ? "Não atribuído"
    : selectedAssignees.length <= 2
      ? selectedAssignees.map((user) => user.name).join(" e ")
      : `${selectedAssignees[0]?.name}, ${selectedAssignees[1]?.name} e mais ${selectedAssignees.length - 2}`;
  const matchingCompanies = useMemo(() => {
    const search = companyName.trim().toLocaleLowerCase("pt-BR");
    const companies = !search || selectedCompanyId ? registeredCompanies : registeredCompanies.filter((company) => company.name.toLocaleLowerCase("pt-BR").includes(search));
    return [{ id: "__none__", name: "Sem empresa", image: null }, ...companies];
  }, [companyName, registeredCompanies, selectedCompanyId]);
  const contactCompany = useMemo(() => registeredCompanies.find((company) => (
    company.name.localeCompare(contact.companyName ?? "", "pt-BR", { sensitivity: "base" }) === 0
  )) ?? null, [contact.companyName, registeredCompanies]);
  const matchingJobTitles = JOB_TITLE_OPTIONS.filter((option) => (
    !jobTitle.trim() || option.toLocaleLowerCase("pt-BR").includes(jobTitle.trim().toLocaleLowerCase("pt-BR"))
  ));

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${API_URL}/clients`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          clients?: Array<{ id?: string; name?: string; image?: string | null; links?: string[] }>;
        };
        if (!response.ok || !Array.isArray(payload.clients)) return;
        setRegisteredCompanies(payload.clients
          .filter((client): client is { id: string; name: string; image?: string | null; links?: string[] } => Boolean(client.id && client.name?.trim()))
          .map((client) => ({
            id: client.id,
            name: client.name.trim(),
            image: client.image ?? null,
            links: Array.isArray(client.links) ? client.links : [],
          }))
          .sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" })));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [contact.id]);

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

  function startEditing(focusPhone = false) {
    const [first = "", ...rest] = contact.name.trim().split(/\s+/);
    setFirstName(first);
    setLastName(rest.join(" "));
    setCompanyName(contact.companyName ?? "");
    setSelectedCompanyId(null);
    setCompanyPickerOpen(false);
    setActiveCompanyIndex(0);
    setCompaniesLoading(true);
    setJobTitle(contact.jobTitle ?? "");
    setJobPickerOpen(false);
    setActiveJobIndex(0);
    setPhone(formatContactPhone(contact.phone));
    setError(null);
    setEditing(true);
    void fetch(`${API_URL}/clients`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          clients?: Array<{ id?: string; name?: string; image?: string | null; links?: string[] }>;
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.clients)) {
          throw new Error(payload.error || "Não foi possível carregar as empresas cadastradas.");
        }
        const companies = payload.clients
          .filter((client): client is { id: string; name: string; image?: string | null; links?: string[] } => Boolean(client.id && client.name?.trim()))
          .map((client) => ({
            id: client.id,
            name: client.name.trim(),
            image: client.image ?? null,
            links: Array.isArray(client.links) ? client.links : [],
          }))
          .sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" }));
        setRegisteredCompanies(companies);
        const currentCompany = companies.find((company) => company.name.localeCompare(contact.companyName ?? "", "pt-BR", { sensitivity: "base" }) === 0);
        setSelectedCompanyId(currentCompany?.id ?? null);
      })
      .catch((requestError: unknown) => {
        setRegisteredCompanies([]);
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as empresas cadastradas.");
      })
      .finally(() => setCompaniesLoading(false));
    if (focusPhone) requestAnimationFrame(() => phoneInputRef.current?.focus());
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !firstName.trim()) return;
    if (!selectedCompanyId || !companyName.trim()) {
      setError("Selecione uma empresa cadastrada.");
      return;
    }

    const name = `${firstName.trim()} ${lastName.trim()}`.trim().replace(/\s+/g, " ");
    const normalizedPhone = phone.replace(/\D/g, "");
    if (!contact.isGroup && !/^\d{7,15}$/.test(normalizedPhone)) {
      setError("Informe um número internacional válido, com 7 a 15 dígitos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRenameContact(contact.id, name, selectedCompanyId === "__none__" ? "" : companyName.trim(), jobTitle.trim(), contact.isGroup ? undefined : normalizedPhone);
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
      className="absolute inset-0 z-40 flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-[#09090b]
        @min-[1024px]:relative @min-[1024px]:inset-auto @min-[1024px]:z-auto @min-[1024px]:h-full @min-[1024px]:w-[min(24rem,40%)]"
    >
      {mediaOpen ? <ContactMediaBrowser contactId={contact.id} contactName={contact.name} onBack={() => {
        setMediaOpen(false);
        requestAnimationFrame(() => mediaTriggerRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
      }} /> : <>
      <header className={`${headerStyles.header} flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 px-4 pt-[env(safe-area-inset-top)] @min-[1024px]:h-16 @min-[1024px]:pt-0`}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar informações"
          className="flex size-11 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 active:scale-95 lg:size-9"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <h2 className="text-base font-medium text-white lg:text-sm">Informações do contato</h2>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overscroll-contain px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ContactPhoto contact={contact} />
        <h3 className="mt-4 max-w-full text-center text-2xl font-semibold break-words text-white lg:text-xl">
          {contact.name}
          {contact.jobTitle && <span className="font-normal text-zinc-400"> - {contact.jobTitle}</span>}
        </h3>
        <p className="mt-1 text-base text-zinc-300/80 lg:text-sm">
          {contact.isGroup ? "Grupo do WhatsApp" : contact.phone}
        </p>

        <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.form
            key="edit-contact"
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32, mass: 0.8, opacity: { duration: 0.15 } }}
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
            <div className="relative block text-sm text-zinc-300/80 lg:text-xs">
              <span>Empresa</span>
              <div className="mt-1.5 flex min-h-10 w-full items-center gap-2 rounded-xl bg-zinc-900 px-3 text-white focus-within:ring-2 focus-within:ring-white/40">
                {selectedCompanyId && (() => {
                  const company = registeredCompanies.find((item) => item.id === selectedCompanyId);
                  return company ? (
                    <span aria-hidden="true" className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.07] text-zinc-500">
                      <Building2 className="size-4" strokeWidth={1.7} />
                      {company.image && <Image src={company.image} alt="" width={28} height={28} unoptimized className="absolute inset-0 size-full object-contain p-0.5" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                    </span>
                  ) : null;
                })()}
                <input
                  required
                  type="text"
                  role="combobox"
                  aria-label="Pesquisar empresa cadastrada"
                  aria-autocomplete="list"
                  aria-expanded={companyPickerOpen}
                  aria-controls="contact-company-options"
                  aria-activedescendant={companyPickerOpen && matchingCompanies[activeCompanyIndex] ? `contact-company-${matchingCompanies[activeCompanyIndex].id}` : undefined}
                  autoComplete="off"
                  maxLength={191}
                  value={companyName}
                  onFocus={() => setCompanyPickerOpen(true)}
                  onBlur={() => window.setTimeout(() => setCompanyPickerOpen(false), 120)}
                  onChange={(event) => {
                    setCompanyName(event.target.value);
                    setSelectedCompanyId(null);
                    setActiveCompanyIndex(0);
                    setCompanyPickerOpen(true);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setCompanyPickerOpen(true);
                      setActiveCompanyIndex((current) => Math.max(0, Math.min(current + 1, matchingCompanies.length - 1)));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveCompanyIndex((current) => Math.max(current - 1, 0));
                    } else if (event.key === "Enter" && companyPickerOpen && matchingCompanies[activeCompanyIndex]) {
                      event.preventDefault();
                      const company = matchingCompanies[activeCompanyIndex];
                      setSelectedCompanyId(company.id);
                      setCompanyName(company.name);
                      setCompanyPickerOpen(false);
                    } else if (event.key === "Escape") {
                      setCompanyPickerOpen(false);
                    }
                  }}
                  disabled={saving || companiesLoading}
                  placeholder={companiesLoading ? "Carregando empresas..." : "Digite o nome da empresa"}
                  className="min-w-0 flex-1 bg-transparent py-2 text-base text-white outline-none placeholder:text-zinc-600 disabled:opacity-50 lg:text-sm"
                />
                <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-zinc-500 transition-transform ${companyPickerOpen ? "rotate-180" : ""}`} strokeWidth={1.8} />
              </div>
              <AnimatePresence>
                {companyPickerOpen && !companiesLoading && (
                  <motion.div initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.975 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.985, pointerEvents: "none" }} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32, mass: 0.7, opacity: { duration: 0.14 } }} style={{ transformOrigin: "top" }} id="contact-company-options" role="listbox" aria-label="Empresas cadastradas" className="absolute inset-x-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/[0.09] bg-zinc-900 p-1.5 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {matchingCompanies.length ? matchingCompanies.map((company, index) => (
                      <button
                        id={`contact-company-${company.id}`}
                        key={company.id}
                        type="button"
                        role="option"
                        aria-selected={company.id === selectedCompanyId}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveCompanyIndex(index)}
                        onClick={() => {
                          setSelectedCompanyId(company.id);
                          setCompanyName(company.name);
                          setCompanyPickerOpen(false);
                          setError(null);
                        }}
                        className={["flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", index === activeCompanyIndex ? "bg-white/[0.09]" : "hover:bg-white/[0.06]"].join(" ")}
                      >
                        <span aria-hidden="true" className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.07] text-zinc-500">
                          <Building2 className="size-4" strokeWidth={1.7} />
                          {company.image && <Image src={company.image} alt="" width={36} height={36} unoptimized className="absolute inset-0 size-full object-contain p-1" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">{company.name}</span>
                        {company.id === selectedCompanyId && <Check aria-hidden="true" className="size-4 text-zinc-400" />}
                      </button>
                    )) : (
                      <p className="px-3 py-4 text-center text-xs text-zinc-500">Nenhuma empresa encontrada.</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="relative block text-sm text-zinc-300/80 lg:text-xs">
              <span>Cargo <span className="text-zinc-600">(opcional)</span></span>
              <div className="mt-1.5 flex min-h-10 w-full items-center gap-2 rounded-xl bg-zinc-900 px-3 text-white focus-within:ring-2 focus-within:ring-white/40">
                <input
                  autoComplete="off"
                  maxLength={191}
                  value={jobTitle}
                  onFocus={() => setJobPickerOpen(true)}
                  onBlur={() => window.setTimeout(() => setJobPickerOpen(false), 120)}
                  onChange={(event) => {
                    setJobTitle(event.target.value);
                    setActiveJobIndex(0);
                    setJobPickerOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setJobPickerOpen(true);
                      setActiveJobIndex((current) => Math.max(0, Math.min(current + 1, matchingJobTitles.length - 1)));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveJobIndex((current) => Math.max(current - 1, 0));
                    } else if (event.key === "Enter" && jobPickerOpen && matchingJobTitles[activeJobIndex]) {
                      event.preventDefault();
                      setJobTitle(matchingJobTitles[activeJobIndex]);
                      setJobPickerOpen(false);
                    } else if (event.key === "Escape") {
                      setJobPickerOpen(false);
                    }
                  }}
                  role="combobox"
                  aria-label="Cargo opcional"
                  aria-autocomplete="list"
                  aria-expanded={jobPickerOpen}
                  aria-controls="edit-contact-job-options"
                  disabled={saving}
                  placeholder="Selecione ou digite um cargo"
                  className="min-w-0 flex-1 bg-transparent py-2 text-base text-white outline-none placeholder:text-zinc-600 disabled:opacity-50 lg:text-sm"
                />
                <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-zinc-500 transition-transform ${jobPickerOpen ? "rotate-180" : ""}`} strokeWidth={1.8} />
              </div>
              <AnimatePresence>
                {jobPickerOpen && (
                  <motion.div initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.975 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.985, pointerEvents: "none" }} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32, mass: 0.7, opacity: { duration: 0.14 } }} style={{ transformOrigin: "top" }} id="edit-contact-job-options" role="listbox" aria-label="Cargos sugeridos" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-white/[0.09] bg-zinc-900 p-1.5 shadow-2xl">
                    {matchingJobTitles.length ? matchingJobTitles.map((option, index) => (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={jobTitle === option}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveJobIndex(index)}
                        onClick={() => { setJobTitle(option); setJobPickerOpen(false); }}
                        className={["flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors", index === activeJobIndex ? "bg-white/[0.09] text-white" : "text-zinc-300 hover:bg-white/[0.06]"].join(" ")}
                      >
                        {option}
                      </button>
                    )) : (
                      <p className="px-3 py-3 text-xs text-zinc-500">O cargo digitado será salvo.</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {!contact.isGroup && <label className="block text-sm text-zinc-300/80 lg:text-xs">
              Telefone
              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                maxLength={24}
                value={phone}
                onChange={(event) => {
                  const input = event.currentTarget;
                  const digitsBeforeCursor = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
                  const formatted = formatContactPhone(input.value);
                  setPhone(formatted);
                  requestAnimationFrame(() => {
                    let cursor = 0;
                    let digits = 0;
                    while (cursor < formatted.length && digits < digitsBeforeCursor) {
                      if (/\d/.test(formatted[cursor])) digits++;
                      cursor++;
                    }
                    input.setSelectionRange(cursor, cursor);
                  });
                }}
                onKeyDown={(event) => {
                  const input = event.currentTarget;
                  const cursor = input.selectionStart ?? 0;
                  if (cursor !== input.selectionEnd) return;
                  if (event.key === "Backspace" && cursor > 0 && /\D/.test(input.value[cursor - 1])) {
                    input.setSelectionRange(Math.max(0, cursor - 2), cursor);
                  } else if (event.key === "Delete" && cursor < input.value.length && /\D/.test(input.value[cursor])) {
                    input.setSelectionRange(cursor, cursor + 2);
                  }
                }}
                disabled={saving}
                placeholder="55 11 99999-9999"
                className="mt-1.5 w-full rounded-xl bg-zinc-900 px-3 py-2 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 lg:text-sm"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">Inclua o código do país e o DDD.</span>
            </label>}
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
                disabled={saving || !firstName.trim() || !selectedCompanyId}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.button
            key="edit-contact-trigger"
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            type="button"
            onClick={() => startEditing()}
            className="mt-3 flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-sm text-zinc-300/80 transition hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 lg:min-h-0 lg:text-xs"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar contato
          </motion.button>
        )}
        </AnimatePresence>

        <div ref={mediaTriggerRef} className="mt-7 w-full shrink-0">
          <ContactMediaSummary contactId={contact.id} onOpen={() => setMediaOpen(true)} />
        </div>

        <motion.dl layout={reduceMotion ? false : "position"} transition={{ type: "spring", stiffness: 380, damping: 34 }} className="mt-8 w-full shrink-0 space-y-5 px-1">
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Tipo</dt>
            <dd className="mt-1 text-base text-white lg:text-sm">
              {contact.isGroup ? "Grupo" : "Contato"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Telefone</dt>
            <dd className="mt-1 flex items-center gap-2 text-base text-white lg:text-sm">
              <span className="min-w-0 break-all">{contact.phone}</span>
            </dd>
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
            <dd className="mt-1.5 flex items-center gap-2.5 text-base text-white lg:text-sm">
              {contactCompany && (
                <span aria-hidden="true" className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] text-zinc-500">
                  <Building2 className="size-4" strokeWidth={1.7} />
                  {contactCompany.image && (
                    <Image
                      src={contactCompany.image}
                      alt=""
                      width={36}
                      height={36}
                      unoptimized
                      className="absolute inset-0 size-full object-contain p-1"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  )}
                </span>
              )}
              <span className="min-w-0 break-words font-medium">{contact.companyName}</span>
            </dd>
          </div>}
          {!contact.isGroup && contact.jobTitle && <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Cargo</dt>
            <dd className="mt-1 break-words text-base text-white lg:text-sm">{contact.jobTitle}</dd>
          </div>}
          {!contact.isGroup && contactCompany && contactCompany.links.length > 0 && <div>
            <dt className="flex items-center gap-2 text-sm text-zinc-400 lg:text-xs">
              <Link2 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
              Links da empresa
            </dt>
            <dd className="mt-2 space-y-1.5">
              {contactCompany.links.map((link) => {
                let label = link;
                try {
                  const url = new URL(link);
                  label = url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
                } catch {
                  label = link;
                }
                return (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    title={link}
                    className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/40"
                  >
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-500 transition-colors group-hover:text-zinc-300">
                      <Link2 className="size-3.5" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{label}</span>
                    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300" strokeWidth={1.8} />
                  </a>
                );
              })}
            </dd>
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
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-white/[0.045] px-3 text-left text-base text-zinc-100 transition-colors hover:bg-white/[0.075] focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-60 lg:text-sm"
              >
                <motion.span layout={reduceMotion ? false : true} aria-hidden="true" className="relative flex shrink-0 -space-x-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {(selectedAssignees.length ? selectedAssignees.slice(0, 3) : [{ id: "unassigned", name: "", image: null }]).map((user) => (
                      <motion.span
                        key={user.id}
                        layout={reduceMotion ? false : "position"}
                        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.7 }}
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 30 }}
                        className="relative flex shrink-0"
                      ><UserAvatar name={user.name} image={user.image} /></motion.span>
                    ))}
                  </AnimatePresence>
                </motion.span>
                <span className="min-w-0 flex-1 truncate">{assigneesLoading ? "Carregando usuários..." : assigneeSummary}</span>
                <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-zinc-500 transition-transform ${assigneeOpen ? "rotate-180" : ""}`} />
              </button>
              {assigneeOpen && <motion.div
                ref={assigneeMenuRef}
                role="menu"
                aria-label="Escolher responsáveis"
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                onKeyDown={(event) => {
                  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                  const index = options.indexOf(document.activeElement as HTMLButtonElement);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
                  options[next]?.focus();
                }}
                className="mt-2 max-h-60 space-y-0.5 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.35)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <AssigneeOption name="Não atribuído" avatarName="" checked={assignedUserIds.length === 0} onClick={() => void changeAssignees([])} />
                {assignees.map((user) => <AssigneeOption key={user.id} name={user.name} image={user.image} checked={assignedUserIds.includes(user.id)} onClick={() => toggleAssignee(user.id)} />)}
              </motion.div>}
              {assignmentSaving && <p role="status" className="mt-1 text-xs text-zinc-400">Salvando responsáveis...</p>}
              {assignmentError && <p role="alert" className="mt-1 text-xs text-red-300">{assignmentError}</p>}
            </dd>
          </div>}
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Prioridade</dt>
            <LayoutGroup>
            <dd className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-white/[0.025] p-1">
              {contactPriorities.map((option) => <motion.button
                key={option.value}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                type="button"
                aria-pressed={selectedPriority === option.value}
                disabled={prioritySaving}
                onClick={() => void changePriority(selectedPriority === option.value ? "NONE" : option.value)}
                className={`relative isolate flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-60 lg:h-9 lg:text-xs ${selectedPriority === option.value ? option.value === "LOW" ? "text-green-400" : option.value === "MEDIUM" ? "text-yellow-300" : "text-red-400" : option.value === "LOW" ? "text-zinc-400 opacity-45 hover:text-green-400 hover:opacity-100" : option.value === "MEDIUM" ? "text-zinc-400 opacity-45 hover:text-yellow-300 hover:opacity-100" : "text-zinc-400 opacity-45 hover:text-red-400 hover:opacity-100"}`}
              >
                {selectedPriority === option.value && <motion.span aria-hidden="true" layoutId="contact-priority" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }} className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-white/[0.1] shadow-sm" />}
                <span aria-hidden="true" className={`size-1.5 rounded-full ${option.dot}`} />
                {option.label}
              </motion.button>)}
            </dd>
            </LayoutGroup>
            {priorityError && <p role="alert" className="mt-1 text-xs text-red-300">{priorityError}</p>}
          </div>
          <div>
            <dt className="text-sm text-zinc-400 lg:text-xs">Status</dt>
            <dd className="mt-1 text-base text-white lg:text-sm">
              {contact.archived ? "Arquivado" : "Ativo"}
            </dd>
          </div>
        </motion.dl>

        {!contact.isGroup && (
          <button
            type="button"
            onClick={onCloseWithBot}
            disabled={closing}
            aria-busy={closing}
            className="mt-7 flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-4 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.1] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
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
      </>}
    </motion.aside>
  );
}
