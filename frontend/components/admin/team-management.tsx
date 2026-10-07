"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, MoreHorizontal, Plus, Search, Shield, Trash2, UsersRound, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getCompanyWorkspace } from "@/lib/company-api";
import { CompanyGroupDialog } from "./company-group-dialog";
import { CompanyMemberDialog } from "./company-member-dialog";
import { permissionSections, type CompanyGroup, type OrganizationMember, type OrganizationSummary } from "./company-types";
import { v4 as uuidv4 } from "uuid";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type PendingInvitation = {
  id: string;
  email: string;
  name?: string | null;
  jobTitle?: string | null;
  role?: string | null;
  status: string;
  expiresAt: string | Date;
};
type DraftUser = {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  permission: "member" | "admin";
};
type Step = "overview" | "company" | "users";
type CompanyTab = "overview" | "members" | "groups" | "invites";

const inputClass = "h-10 w-full min-w-0 rounded-lg border border-white/10 bg-black px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25";

function emptyDraft(): DraftUser {
  return { id: uuidv4(), name: "", email: "", jobTitle: "", permission: "member" };
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "empresa";
}

function roleLabel(role?: string | null) {
  if (role === "owner") return "Dono";
  if (role === "admin") return "Administrador";
  return "Usuário";
}

export function TeamManagement({ currentUserId, currentUserName, currentUserEmail, canCreateCompany = false }: {
  currentUserId: string;
  currentUserName?: string;
  currentUserEmail?: string;
  canCreateCompany?: boolean;
}) {
  const [organization, setOrganization] = useState<OrganizationSummary | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [groups, setGroups] = useState<CompanyGroup[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("overview");
  const [companyName, setCompanyName] = useState("");
  const [draftUsers, setDraftUsers] = useState<DraftUser[]>([emptyDraft()]);
  const [creating, setCreating] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteJobTitle, setInviteJobTitle] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CompanyGroup | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyTab>("overview");
  const [memberSearch, setMemberSearch] = useState("");
  const reduceMotion = useReducedMotion();
  const currentMembership = members.find((member) => member.userId === currentUserId);
  const canManage = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canEditMembers = currentMembership?.role === "owner"
    || (currentMembership?.role === "admin" && currentMembership.effectivePermissions.includes("COMPANY_MEMBERS_EDIT"));

  const loadOrganization = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: organizationError } = await authClient.organization.list();
      if (organizationError) throw new Error("organization");
      const nextOrganization = (data?.[0] as OrganizationSummary | undefined) ?? null;
      setOrganization(nextOrganization);
      if (!nextOrganization) {
        setMembers([]);
        setGroups([]);
        setInvitations([]);
        return;
      }
      const [workspace, invitationResult] = await Promise.all([
        getCompanyWorkspace(nextOrganization.id),
        authClient.organization.listInvitations({ query: { organizationId: nextOrganization.id } }),
      ]);
      setMembers(workspace.members);
      setGroups(workspace.groups);
      setInvitations(((invitationResult.data ?? []) as PendingInvitation[]).filter((item) => item.status === "pending"));
    } catch {
      setError("Não foi possível carregar os dados da empresa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadOrganization(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOrganization]);

  async function annotateInvitation(organizationId: string, invitationId: string, name: string, jobTitle: string) {
    const response = await fetch(`${API_URL}/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}/profile`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, jobTitle }),
    });
    if (!response.ok) throw new Error("profile");
  }

  async function inviteUser(organizationId: string, user: Omit<DraftUser, "id">) {
    const { data, error: invitationError } = await authClient.organization.inviteMember({
      email: user.email.trim().toLowerCase(),
      role: user.permission,
      organizationId,
      resend: true,
    });
    if (invitationError || !data?.id) throw new Error(invitationError?.message ?? "invite");
    await annotateInvitation(organizationId, data.id, user.name.trim(), user.jobTitle.trim());
  }

  function continueToUsers() {
    if (!companyName.trim()) {
      setError("Informe o nome da empresa.");
      return;
    }
    setError(null);
    setStep("users");
  }

  function updateDraft(id: string, field: keyof Omit<DraftUser, "id">, value: string) {
    setDraftUsers((current) => current.map((user) => user.id === id ? { ...user, [field]: value } : user));
  }

  async function finishCreation() {
    const populatedUsers = draftUsers.filter((user) => user.name.trim() || user.email.trim() || user.jobTitle.trim());
    if (populatedUsers.some((user) => !user.name.trim() || !user.email.trim())) {
      setError("Preencha nome e e-mail de cada usuário adicionado.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const slug = `${slugify(companyName)}-${currentUserId.slice(0, 6).toLowerCase()}`;
      const { data, error: creationError } = await authClient.organization.create({ name: companyName.trim(), slug });
      if (creationError || !data?.id) throw new Error(creationError?.message ?? "create");
      for (const user of populatedUsers) await inviteUser(data.id, user);
      setStep("overview");
      setCompanyName("");
      setDraftUsers([emptyDraft()]);
      await loadOrganization();
    } catch (creationError) {
      setError(creationError instanceof Error && creationError.message !== "create" ? creationError.message : "Não foi possível criar a empresa.");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite() {
    if (!organization || !inviteName.trim() || !inviteEmail.trim()) {
      setInviteMessage("Preencha nome e e-mail.");
      return;
    }
    setInviting(true);
    setInviteMessage(null);
    try {
      await inviteUser(organization.id, { name: inviteName, email: inviteEmail, jobTitle: inviteJobTitle, permission: inviteRole });
      setInviteName("");
      setInviteEmail("");
      setInviteJobTitle("");
      setInviteRole("member");
      setInviteMessage("Usuário adicionado à empresa e convite criado.");
      setInviteOpen(false);
      await loadOrganization();
    } catch {
      setInviteMessage("Não foi possível adicionar o usuário.");
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(member: OrganizationMember) {
    if (!organization || member.role === "owner") return;
    setBusyId(member.id);
    await authClient.organization.updateMemberRole({ memberId: member.id, role: member.role === "admin" ? "member" : "admin", organizationId: organization.id });
    await loadOrganization();
    setBusyId(null);
  }

  async function removeMember(member: OrganizationMember) {
    if (!organization || member.role === "owner" || member.userId === currentUserId) return;
    if (!window.confirm(`Remover ${member.user.name} da empresa?`)) return;
    setBusyId(member.id);
    await authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId: organization.id });
    await loadOrganization();
    setBusyId(null);
  }

  async function cancelInvitation(invitationId: string) {
    if (!organization) return;
    setBusyId(invitationId);
    await authClient.organization.cancelInvitation({ invitationId });
    await loadOrganization();
    setBusyId(null);
  }

  if (loading) return <p className="text-sm text-zinc-400">Carregando empresa...</p>;

  if (!organization && step === "overview") {
    if (!canCreateCompany) {
      return <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-8"><h3 className="text-lg font-semibold text-zinc-100">Empresa</h3><p className="mt-3 text-sm text-zinc-400">Sua conta ainda não está vinculada a uma empresa. Peça acesso ao administrador.</p></section>;
    }
    return (
      <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-8">
        <h3 className="text-lg font-semibold text-zinc-100">Sua empresa no CotrimBot</h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">Crie sua empresa para organizar sua equipe, definir permissões e adicionar as pessoas que usarão o atendimento.</p>
        <button type="button" onClick={() => { setError(null); setStep("company"); }} className="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200">Criar sua empresa</button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>
    );
  }

  if (!organization && step === "company") {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Etapa 1 de 2</p>
        <h3 className="mt-2 text-xl font-semibold text-zinc-100">Dados da empresa</h3>
        <label className="mt-6 block max-w-xl"><span className="mb-2 block text-sm text-zinc-400">Nome da empresa</span><input autoFocus value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Ex.: CotrimBot LTDA" className={inputClass} /></label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-6 flex gap-3"><button type="button" onClick={() => setStep("overview")} className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-zinc-300 hover:bg-white/5">Voltar</button><button type="button" onClick={continueToUsers} className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200">Continuar</button></div>
      </section>
    );
  }

  if (!organization && step === "users") {
    return (
      <div className="flex flex-col gap-5">
        <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Etapa 2 de 2</p>
          <h3 className="mt-2 text-xl font-semibold text-zinc-100">Adicionar usuários</h3>
          <p className="mt-2 text-sm text-zinc-400"><strong className="text-zinc-200">{companyName}</strong> será criada com você como dono e administrador.</p>
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-sm font-medium text-zinc-100">{currentUserName || "Você"}</p><p className="text-xs text-zinc-400">{currentUserEmail} · Dono / Administrador</p></div>
        </section>
        {draftUsers.map((user, index) => (
          <section key={user.id} className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-5">
            <div className="mb-4 flex items-center justify-between"><h4 className="text-sm font-semibold text-zinc-200">Usuário {index + 1}</h4>{draftUsers.length > 1 && <button type="button" aria-label="Remover usuário" onClick={() => setDraftUsers((current) => current.filter((item) => item.id !== user.id))} className="rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-red-400"><Trash2 size={16} /></button>}</div>
            <div className="grid gap-3 sm:grid-cols-2"><input value={user.name} onChange={(event) => updateDraft(user.id, "name", event.target.value)} placeholder="Nome" className={inputClass} /><input type="email" value={user.email} onChange={(event) => updateDraft(user.id, "email", event.target.value)} placeholder="E-mail" className={inputClass} /><input value={user.jobTitle} onChange={(event) => updateDraft(user.id, "jobTitle", event.target.value)} placeholder="Cargo / função" className={inputClass} /><select value={user.permission} onChange={(event) => updateDraft(user.id, "permission", event.target.value)} className={inputClass}><option value="member">Usuário</option><option value="admin">Administrador</option></select></div>
          </section>
        ))}
        <button type="button" onClick={() => setDraftUsers((current) => [...current, emptyDraft()])} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-sm text-zinc-300 hover:border-white/25 hover:bg-white/[0.03]"><Plus size={17} /> Adicionar outro usuário</button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-between gap-3"><button type="button" disabled={creating} onClick={() => setStep("company")} className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-zinc-300 hover:bg-white/5">Voltar</button><button type="button" disabled={creating} onClick={() => void finishCreation()} className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">{creating ? "Criando empresa..." : "Finalizar criação"}</button></div>
      </div>
    );
  }

  if (!organization) return null;

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;

  function openMember(member: OrganizationMember) {
    setSelectedMemberId(member.id);
    setMemberDialogOpen(true);
  }

  function openNewGroup() {
    setSelectedGroup(null);
    setGroupDialogOpen(true);
  }

  function openGroup(group: CompanyGroup) {
    setSelectedGroup(group);
    setGroupDialogOpen(true);
  }

  const permissionCount = permissionSections.reduce((total, section) => total + section.permissions.length, 0);
  const normalizedMemberSearch = memberSearch.trim().toLocaleLowerCase("pt-BR");
  const filteredMembers = normalizedMemberSearch
    ? members.filter((member) => [member.displayName, member.user.name, member.user.email, member.jobTitle]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalizedMemberSearch)))
    : members;
  const tabs: { id: CompanyTab; label: string; count?: number }[] = [
    { id: "overview", label: "Visão geral" },
    { id: "members", label: "Membros", count: members.length },
    { id: "groups", label: "Grupos", count: groups.length },
    { id: "invites", label: "Convites", count: invitations.length },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-9">
      <section className="border-b border-white/[0.07] pb-7">
        <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center text-zinc-500"><Building2 size={20} /></span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-zinc-100">{organization.name}</h3>
              <p className="mt-1 text-sm text-zinc-500">{members.length} {members.length === 1 ? "membro" : "membros"} <span className="px-1 text-zinc-700">•</span> {groups.length} {groups.length === 1 ? "grupo" : "grupos"}</p>
            </div>
          </div>
          {canManage && <button type="button" onClick={() => setActiveTab("members")} className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200">Gerenciar empresa</button>}
        </div>
      </section>

      <div id="company-management" className="scroll-mt-6">
        <nav aria-label="Navegação da empresa" className="mb-8 overflow-x-auto border-b border-white/[0.07]">
          <div className="flex min-w-max gap-7">
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return <button key={tab.id} type="button" aria-current={selected ? "page" : undefined} onClick={() => setActiveTab(tab.id)} className={`relative flex items-center gap-2 pb-3 text-sm transition-colors ${selected ? "font-medium text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                {tab.label}
                {tab.count !== undefined && <span className={`text-xs tabular-nums ${selected ? "text-zinc-400" : "text-zinc-700"}`}>{tab.count}</span>}
                {selected && <motion.span layoutId="company-active-tab" className="absolute inset-x-0 -bottom-px h-px bg-zinc-200" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }} />}
              </button>;
            })}
          </div>
        </nav>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={activeTab} initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }} transition={{ duration: reduceMotion ? 0 : 0.16 }}>

      {activeTab === "overview" && <section className="space-y-8">
        <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-4">
          {[
            [members.length, members.length === 1 ? "Membro" : "Membros"],
            [groups.length, groups.length === 1 ? "Grupo" : "Grupos"],
            [invitations.length, invitations.length === 1 ? "Convite pendente" : "Convites pendentes"],
          ].map(([value, label], index) => <button key={label} type="button" onClick={() => setActiveTab((index === 0 ? "members" : index === 1 ? "groups" : "invites") as CompanyTab)} className="px-4 text-left first:pl-1 last:pr-1"><span className="block text-xl font-semibold tabular-nums text-zinc-100">{value}</span><span className="mt-1 block text-xs text-zinc-500">{label}</span></button>)}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium text-zinc-200">Membros recentes</h3><button type="button" onClick={() => setActiveTab("members")} className="text-xs text-zinc-600 hover:text-zinc-300">Ver todos</button></div>
            <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">{members.slice(0, 3).map((member) => <button key={member.id} type="button" onClick={() => openMember(member)} className="flex w-full items-center gap-3 py-3 text-left"><span className="flex size-8 items-center justify-center rounded-full bg-white/[0.05] text-xs text-zinc-300">{((member.displayName || member.user.name)[0] || "?").toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm text-zinc-300">{member.displayName || member.user.name}</span><span className="block truncate text-xs text-zinc-600">{member.user.email}</span></span></button>)}</div>
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium text-zinc-200">Grupos recentes</h3><button type="button" onClick={() => setActiveTab("groups")} className="text-xs text-zinc-600 hover:text-zinc-300">Ver todos</button></div>
            {groups.length ? <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">{groups.slice(0, 3).map((group) => <button key={group.id} type="button" disabled={!canManage} onClick={() => openGroup(group)} className="flex w-full items-center justify-between gap-3 py-3 text-left disabled:cursor-default"><span className="truncate text-sm text-zinc-300">{group.name}</span><span className="shrink-0 text-xs text-zinc-600">{group.memberIds.length} {group.memberIds.length === 1 ? "membro" : "membros"}</span></button>)}</div> : <p className="border-y border-white/[0.07] py-5 text-sm text-zinc-600">Nenhum grupo criado.</p>}
          </div>
        </div>
      </section>}

      {activeTab === "members" && <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-200">Membros</h3>
          {canManage && (
            <motion.button
              type="button"
              aria-label={inviteOpen ? "Fechar formulário" : "Convidar membro"}
              aria-expanded={inviteOpen}
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              onClick={() => { setInviteOpen((current) => !current); setInviteMessage(null); }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              {inviteOpen ? <X size={15} /> : <Plus size={15} />} {inviteOpen ? "Fechar" : "Convidar"}
            </motion.button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {canManage && inviteOpen && (
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.985 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mb-4 origin-top rounded-2xl bg-white/[0.035] p-5"
            >
              <h4 className="mb-4 text-sm font-semibold text-zinc-100">Novo usuário</h4>
              <div className="grid gap-3 sm:grid-cols-2"><input autoFocus value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Nome" className={inputClass} /><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="E-mail" className={inputClass} /><input value={inviteJobTitle} onChange={(event) => setInviteJobTitle(event.target.value)} placeholder="Cargo / função" className={inputClass} /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "member" | "admin")} className={inputClass}><option value="member">Usuário</option><option value="admin">Administrador</option></select></div>
              <div className="mt-4 flex items-center gap-3"><button type="button" disabled={inviting} onClick={() => void handleInvite()} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50">{inviting ? "Adicionando..." : "Adicionar usuário"}</button><button type="button" disabled={inviting} onClick={() => setInviteOpen(false)} className="px-2 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-50">Cancelar</button></div>
              {inviteMessage && <p className="mt-3 text-sm text-red-400">{inviteMessage}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        <label className="relative mb-4 block max-w-sm">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <span className="sr-only">Buscar membros</span>
          <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar membros" className="h-9 w-full rounded-lg border border-white/[0.08] bg-transparent pl-9 pr-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-white/20" />
        </label>

        <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {filteredMembers.map((member) => (
            <motion.article key={member.id} whileHover={reduceMotion ? undefined : { x: 2 }} transition={{ duration: 0.18 }} className="relative flex items-center gap-3 px-1 py-4 transition-colors hover:bg-white/[0.015]">
              <button type="button" onClick={() => openMember(member)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.055] text-sm font-semibold text-zinc-200">{((member.displayName || member.user.name).trim()[0] || member.user.email[0] || "?").toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{member.displayName || member.user.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${member.role === "owner" ? "bg-emerald-500/10 text-emerald-400" : member.role === "admin" ? "bg-sky-500/10 text-sky-300" : "bg-white/[0.05] text-zinc-500"}`}>{roleLabel(member.role)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">{member.user.email}</span>
                  <span className="mt-1.5 block truncate text-xs text-zinc-400">{member.groups.length ? member.groups.map((group) => group.name).join(" • ") : member.jobTitle || "Sem grupo"}</span>
                </span>
              </button>
              {canManage && member.role !== "owner" ? (
                <details className="relative shrink-0">
                  <summary aria-label={`Ações de ${member.user.name}`} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18} /></summary>
                  <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#111] p-1 shadow-2xl">
                    <button type="button" onClick={() => openMember(member)} className="w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.06]">Ver detalhes</button>
                    <button type="button" disabled={busyId === member.id} onClick={() => void updateRole(member)} className="w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50">{member.role === "admin" ? "Remover admin" : "Tornar admin"}</button>
                    <button type="button" disabled={busyId === member.id} onClick={() => void removeMember(member)} className="w-full rounded-lg px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">Remover da empresa</button>
                  </div>
                </details>
              ) : <button type="button" aria-label={`Ver detalhes de ${member.user.name}`} onClick={() => openMember(member)} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-200"><MoreHorizontal size={18} /></button>}
            </motion.article>
          ))}
          {!filteredMembers.length && <p className="py-8 text-center text-sm text-zinc-600">Nenhum membro encontrado.</p>}
        </div>
      </section>}

      {activeTab === "groups" && <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-200">Grupos</h3>
          {canManage && <motion.button type="button" whileTap={reduceMotion ? undefined : { scale: 0.96 }} onClick={openNewGroup} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"><Plus size={15} /> Criar grupo</motion.button>}
        </div>

        {groups.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {groups.map((group) => {
              const groupMembers = group.memberIds.map((memberId) => members.find((member) => member.id === memberId)).filter((member): member is OrganizationMember => Boolean(member));
              const hasFullAccess = group.permissions.length === permissionCount;
              return <motion.button key={group.id} type="button" disabled={!canManage} onClick={() => openGroup(group)} whileHover={canManage && !reduceMotion ? { y: -2 } : undefined} whileTap={canManage && !reduceMotion ? { scale: 0.99 } : undefined} transition={{ duration: 0.18 }} className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-5 text-left transition-colors hover:border-white/[0.15] hover:bg-white/[0.025] disabled:cursor-default disabled:hover:border-white/[0.08]">
                <span className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.05] text-zinc-400">{hasFullAccess ? <Shield size={18} /> : <UsersRound size={18} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">{group.name}</span>
                    {group.description && <span className="mt-1 block line-clamp-2 text-xs leading-5 text-zinc-600">{group.description}</span>}
                  </span>
                </span>
                <span className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span>{group.memberIds.length} {group.memberIds.length === 1 ? "membro" : "membros"}</span>
                  <span>{hasFullAccess ? "Acesso completo" : `${group.permissions.length} ${group.permissions.length === 1 ? "permissão" : "permissões"}`}</span>
                </span>
                <span className="mt-4 flex min-h-6 flex-wrap items-center gap-1.5">
                  {groupMembers.slice(0, 2).map((member) => <span key={member.id} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[11px] text-zinc-400">{(member.displayName || member.user.name).split(" ")[0]}</span>)}
                  {groupMembers.length > 2 && <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[11px] text-zinc-500">+{groupMembers.length - 2}</span>}
                  {!groupMembers.length && <span className="text-[11px] text-zinc-700">Nenhum membro</span>}
                </span>
              </motion.button>;
            })}
          </div>
        ) : (
          <div className="border-y border-white/[0.07] px-5 py-8 text-center">
            <UsersRound size={20} className="mx-auto text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">Nenhum grupo criado</p>
            <p className="mt-1 text-xs text-zinc-600">Crie uma equipe para reunir usuários e permissões.</p>
          </div>
        )}
      </section>}

      {activeTab === "invites" && <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">Convites pendentes</h3>
        {invitations.length ? <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">{invitations.map((invitation) => <article key={invitation.id} className="flex items-center gap-3 px-1 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-sm font-semibold text-zinc-300">{(invitation.name || invitation.email).trim()[0]?.toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-100">{invitation.name || invitation.email}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{invitation.email}</p><p className="mt-1 text-xs text-zinc-400">{invitation.jobTitle ? `${invitation.jobTitle} • ` : ""}{roleLabel(invitation.role)}</p></div>{canManage && <button type="button" disabled={busyId === invitation.id} onClick={() => void cancelInvitation(invitation.id)} className="rounded-full px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">Cancelar</button>}</article>)}</div> : <div className="border-y border-white/[0.07] py-8 text-center"><p className="text-sm text-zinc-500">Nenhum convite pendente</p><p className="mt-1 text-xs text-zinc-700">Novos convites aparecerão aqui.</p></div>}
      </section>}
          </motion.div>
        </AnimatePresence>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {groupDialogOpen && <CompanyGroupDialog organizationId={organization.id} group={selectedGroup} members={members} open onOpenChange={setGroupDialogOpen} onSaved={loadOrganization} />}
      {memberDialogOpen && selectedMember && <CompanyMemberDialog organizationId={organization.id} member={selectedMember} open onOpenChange={setMemberDialogOpen} onSaved={loadOrganization} canEdit={selectedMember.userId === currentUserId || Boolean(canEditMembers && (selectedMember.role !== "owner" || currentMembership?.role === "owner"))} />}
    </div>
  );
}
