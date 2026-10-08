"use client";

import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, Check, Copy, MoreHorizontal, Pencil, Plus, Search, Shield, Trash2, UsersRound, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { getCompanyWorkspace, updateCompanyLogo } from "@/lib/company-api";
import { CompanyGroupDialog } from "./company-group-dialog";
import { CompanyMemberAvatar } from "./company-member-avatar";
import { CompanyMemberDialog } from "./company-member-dialog";
import { CompanyContentSkeleton } from "./company-skeleton";
import { InvitationSuccessAnimation } from "./invitation-success-animation";
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
const MotionDialogBackdrop = motion.create(Dialog.Backdrop);
const MotionDialogPopup = motion.create(Dialog.Popup);

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

function renderLogoFile(file: File, size: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }

      const padding = Math.round(size * 0.08);
      const available = size - padding * 2;
      const scale = Math.min(available / image.naturalWidth, available / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.clearRect(0, 0, size, size);
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível abrir a imagem."));
    };
    image.src = objectUrl;
  });
}

async function prepareCompanyLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Escolha uma imagem PNG, JPG ou WebP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("A imagem original deve ter no máximo 5 MB.");
  }

  const primary = await renderLogoFile(file, 256, 0.82);
  if (primary.length <= 60_000) return primary;
  const compact = await renderLogoFile(file, 192, 0.68);
  if (compact.length <= 60_000) return compact;
  throw new Error("Não foi possível reduzir a imagem. Escolha outro arquivo.");
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
  const [createdInvitation, setCreatedInvitation] = useState<{ id: string; email: string } | null>(null);
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CompanyGroup | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CompanyTab>("overview");
  const [memberSearch, setMemberSearch] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const currentMembership = members.find((member) => member.userId === currentUserId);
  const canManage = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canEditMembers = currentMembership?.role === "owner"
    || (currentMembership?.role === "admin" && currentMembership.effectivePermissions.includes("COMPANY_MEMBERS_EDIT"));

  const loadOrganization = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
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
      if (showLoading) setLoading(false);
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
    return data.id;
  }

  async function copyInvitationLink(invitationId: string) {
    const invitationLink = `${window.location.origin}/accept-invitation?id=${encodeURIComponent(invitationId)}`;

    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopiedInvitationId(invitationId);
      window.setTimeout(() => {
        setCopiedInvitationId((current) => current === invitationId ? null : current);
      }, 2000);
    } catch {
      setInviteMessage("Não foi possível copiar o link. Tente novamente.");
    }
  }

  async function handleLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!organization || !file || logoBusy) return;

    setLogoBusy(true);
    setLogoMessage(null);
    try {
      const logo = await prepareCompanyLogo(file);
      await updateCompanyLogo(organization.id, logo);
      setOrganization((current) => current ? { ...current, logo } : current);
      setLogoMessage("Logo atualizada.");
    } catch (logoError) {
      setLogoMessage(logoError instanceof Error ? logoError.message : "Não foi possível atualizar a logo.");
    } finally {
      setLogoBusy(false);
    }
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
      if (populatedUsers.length) setActiveTab("invites");
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
    setCreatedInvitation(null);
    try {
      const invitedEmail = inviteEmail.trim().toLowerCase();
      const invitationId = await inviteUser(organization.id, { name: inviteName, email: inviteEmail, jobTitle: inviteJobTitle, permission: inviteRole });
      setInviteName("");
      setInviteEmail("");
      setInviteJobTitle("");
      setInviteRole("member");
      setCreatedInvitation({ id: invitationId, email: invitedEmail });
      await loadOrganization(false);
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

  if (loading) return <CompanyContentSkeleton />;

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
      <section className="pb-7">
        <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              {canManage ? (
                <>
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void handleLogoFile(event)} />
                  <button type="button" disabled={logoBusy} onClick={() => logoInputRef.current?.click()} aria-label={organization.logo ? "Trocar logo da empresa" : "Adicionar logo da empresa"} title={organization.logo ? "Trocar logo" : "Adicionar logo"} className="group relative flex size-11 items-center justify-center overflow-visible rounded-xl border border-white/[0.08] bg-white/[0.035] text-zinc-500 transition-colors hover:border-white/20 hover:bg-white/[0.055] disabled:opacity-50">
                    <span className="flex size-full items-center justify-center overflow-hidden rounded-xl">
                      {organization.logo
                        ? <Image src={organization.logo} alt={`Logo de ${organization.name}`} width={44} height={44} unoptimized className="size-full object-contain p-1.5" />
                        : <Building2 size={19} />}
                    </span>
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-[#090909] bg-zinc-100 text-zinc-950 shadow-sm transition-transform group-hover:scale-110"><Pencil size={9} strokeWidth={2.5} /></span>
                  </button>
                </>
              ) : (
                <span className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.035] text-zinc-500">
                  {organization.logo
                    ? <Image src={organization.logo} alt={`Logo de ${organization.name}`} width={44} height={44} unoptimized className="size-full object-contain p-1.5" />
                    : <Building2 size={19} />}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-zinc-100">{organization.name}</h3>
              <p className="mt-1 text-sm text-zinc-500">{members.length} {members.length === 1 ? "membro" : "membros"} <span className="px-1 text-zinc-700">•</span> {groups.length} {groups.length === 1 ? "grupo" : "grupos"}</p>
              {logoMessage && <p className="mt-1 text-xs text-zinc-600">{logoMessage}</p>}
            </div>
          </div>
          {canManage && <button type="button" onClick={() => setActiveTab("members")} className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200">Gerenciar empresa</button>}
        </div>
      </section>

      <div id="company-management" className="scroll-mt-6">
        <nav aria-label="Navegação da empresa" className="company-tab-nav mb-8 overflow-x-auto border-b border-white/[0.07]">
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
            <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">{members.slice(0, 3).map((member) => <button key={member.id} type="button" onClick={() => openMember(member)} className="flex w-full items-center gap-3 py-3 text-left"><CompanyMemberAvatar member={member} size="small" /><span className="min-w-0"><span className="block truncate text-sm text-zinc-300">{member.displayName || member.user.name}</span><span className="block truncate text-xs text-zinc-600">{member.user.email}</span></span></button>)}</div>
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium text-zinc-200">Grupos recentes</h3><button type="button" onClick={() => setActiveTab("groups")} className="text-xs text-zinc-600 hover:text-zinc-300">Ver todos</button></div>
            {groups.length ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{groups.slice(0, 3).map((group) => {
              const hasFullAccess = group.permissions.length === permissionCount;
              return <motion.button key={group.id} type="button" disabled={!canManage} onClick={() => openGroup(group)} whileHover={canManage && !reduceMotion ? { y: -2 } : undefined} className="flex aspect-square min-w-0 flex-col rounded-xl border border-white/[0.08] bg-white/[0.018] p-3 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.035] disabled:cursor-default">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.05] text-zinc-500">{hasFullAccess ? <Shield size={15} /> : <UsersRound size={15} />}</span>
                <span className="mt-auto block w-full truncate text-sm font-medium text-zinc-200">{group.name}</span>
                <span className="mt-1 text-[11px] text-zinc-600">{group.memberIds.length} {group.memberIds.length === 1 ? "membro" : "membros"}</span>
              </motion.button>;
            })}</div> : <p className="border-y border-white/[0.07] py-5 text-sm text-zinc-600">Nenhum grupo criado.</p>}
          </div>
        </div>
      </section>}

      {activeTab === "members" && <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-200">Membros</h3>
          {canManage && (
            <motion.button
              type="button"
              aria-label="Convidar membro"
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              onClick={() => { setInviteOpen(true); setInviteMessage(null); setCreatedInvitation(null); }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <Plus size={15} /> Convidar
            </motion.button>
          )}
        </div>

        <label className="relative mb-4 block max-w-sm">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <span className="sr-only">Buscar membros</span>
          <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar membros" className="h-9 w-full rounded-lg border border-white/[0.08] bg-transparent pl-9 pr-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-white/20" />
        </label>

        <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {filteredMembers.map((member) => (
            <motion.article key={member.id} whileHover={reduceMotion ? undefined : { x: 2 }} transition={{ duration: 0.18 }} className="relative flex items-center gap-3 px-1 py-4 transition-colors hover:bg-white/[0.015]">
              <button type="button" onClick={() => openMember(member)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none">
                <CompanyMemberAvatar member={member} />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {groups.map((group) => {
              const hasFullAccess = group.permissions.length === permissionCount;
              return <motion.button key={group.id} type="button" disabled={!canManage} onClick={() => openGroup(group)} whileHover={canManage && !reduceMotion ? { y: -3 } : undefined} whileTap={canManage && !reduceMotion ? { scale: 0.98 } : undefined} transition={{ duration: 0.18 }} className="flex aspect-square min-w-0 flex-col rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.03] disabled:cursor-default disabled:hover:border-white/[0.08]">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.045] text-zinc-500">{hasFullAccess ? <Shield size={17} /> : <UsersRound size={17} />}</span>
                <span className="mt-auto min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-100">{group.name}</span>
                  {group.description && <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-zinc-600">{group.description}</span>}
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 text-[10px] text-zinc-600">
                  <span>{group.memberIds.length} {group.memberIds.length === 1 ? "membro" : "membros"}</span>
                  <span className="truncate">{hasFullAccess ? "Acesso total" : `${group.permissions.length} permissões`}</span>
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
        {invitations.length ? <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">{invitations.map((invitation) => <article key={invitation.id} className="flex flex-wrap items-center gap-3 px-1 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-sm font-semibold text-zinc-300">{(invitation.name || invitation.email).trim()[0]?.toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-100">{invitation.name || invitation.email}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{invitation.email}</p><p className="mt-1 text-xs text-zinc-400">{invitation.jobTitle ? `${invitation.jobTitle} • ` : ""}{roleLabel(invitation.role)}</p></div>{canManage && <div className="flex items-center gap-1"><button type="button" onClick={() => void copyInvitationLink(invitation.id)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100">{copiedInvitationId === invitation.id ? <Check size={13} /> : <Copy size={13} />}{copiedInvitationId === invitation.id ? "Copiado" : "Copiar link"}</button><button type="button" disabled={busyId === invitation.id} onClick={() => void cancelInvitation(invitation.id)} className="rounded-full px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">Cancelar</button></div>}</article>)}</div> : <div className="border-y border-white/[0.07] py-8 text-center"><p className="text-sm text-zinc-500">Nenhum convite pendente</p><p className="mt-1 text-xs text-zinc-700">Novos convites aparecerão aqui.</p></div>}
      </section>}
          </motion.div>
        </AnimatePresence>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {canManage && inviteOpen && <Dialog.Root open onOpenChange={(open) => { if (!inviting) setInviteOpen(open); }}>
        <Dialog.Portal>
          <MotionDialogBackdrop initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm" />
          <div className="pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-4">
            <MotionDialogPopup initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }} className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#090909] text-zinc-100 shadow-2xl outline-none">
            <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
              <div>
                <Dialog.Title className="text-lg font-semibold">{createdInvitation ? "Convite enviado" : "Novo usuário"}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-zinc-500">{createdInvitation ? "O novo usuário já pode acessar o convite." : "Envie um convite para acessar a empresa."}</Dialog.Description>
              </div>
              <Dialog.Close disabled={inviting} aria-label="Fechar" className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"><X size={20} /></Dialog.Close>
            </header>
            {createdInvitation ? <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.25 }} className="min-h-0 overflow-y-auto">
              <div role="status" className="flex flex-col items-center px-6 pb-8 pt-5 text-center">
                <InvitationSuccessAnimation />
                <h3 className="mt-1 text-lg font-semibold text-zinc-100">Convite encaminhado!</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">Enviamos o convite para <span className="break-all font-medium text-zinc-200">{createdInvitation.email}</span>.</p>
                <button type="button" onClick={() => void copyInvitationLink(createdInvitation.id)} className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/[0.05]">
                  {copiedInvitationId === createdInvitation.id ? <Check size={16} /> : <Copy size={16} />}
                  {copiedInvitationId === createdInvitation.id ? "Link copiado" : "Copiar link de acesso"}
                </button>
                {inviteMessage && <p role="alert" className="mt-3 text-sm text-red-400">{inviteMessage}</p>}
              </div>
              <footer className="flex justify-end gap-3 border-t border-white/[0.07] px-6 py-4">
                <button type="button" onClick={() => { setCreatedInvitation(null); setInviteMessage(null); }} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">Convidar outro</button>
                <Dialog.Close className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200">Concluir</Dialog.Close>
              </footer>
            </motion.div> : <form onSubmit={(event) => { event.preventDefault(); void handleInvite(); }} className="min-h-0 overflow-y-auto">
              <div className="space-y-5 px-6 py-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs text-zinc-400">Nome<input autoFocus required value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Nome" className={`${inputClass} mt-2`} /></label>
                  <label className="text-xs text-zinc-400">E-mail<input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="E-mail" className={`${inputClass} mt-2`} /></label>
                  <label className="text-xs text-zinc-400">Cargo / função<input value={inviteJobTitle} onChange={(event) => setInviteJobTitle(event.target.value)} placeholder="Opcional" className={`${inputClass} mt-2`} /></label>
                  <label className="text-xs text-zinc-400">Permissão<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "member" | "admin")} className={`${inputClass} mt-2`}><option value="member">Usuário</option><option value="admin">Administrador</option></select></label>
                </div>
                {inviteMessage && <p role="alert" className="text-sm text-red-400">{inviteMessage}</p>}
              </div>
              <footer className="flex justify-end gap-3 border-t border-white/[0.07] px-6 py-4">
                <Dialog.Close disabled={inviting} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-50">Cancelar</Dialog.Close>
                <button type="submit" disabled={inviting} className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50">{inviting ? "Adicionando..." : "Adicionar usuário"}</button>
              </footer>
            </form>}
            </MotionDialogPopup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>}
      {groupDialogOpen && <CompanyGroupDialog organizationId={organization.id} group={selectedGroup} members={members} open onOpenChange={setGroupDialogOpen} onSaved={loadOrganization} />}
      {memberDialogOpen && selectedMember && <CompanyMemberDialog organizationId={organization.id} member={selectedMember} open onOpenChange={setMemberDialogOpen} onSaved={loadOrganization} canEdit={selectedMember.userId === currentUserId || Boolean(canEditMembers && (selectedMember.role !== "owner" || currentMembership?.role === "owner"))} canEditSignature={Boolean(canManage && (selectedMember.role !== "owner" || currentMembership?.role === "owner"))} />}
    </div>
  );
}
