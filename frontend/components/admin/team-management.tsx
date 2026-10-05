"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type OrganizationSummary = { id: string; name: string; slug: string };
type OrganizationMember = {
  id: string;
  userId: string;
  role: "owner" | "admin" | "member";
  jobTitle?: string | null;
  user: { id: string; name: string; email: string };
};
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

const inputClass = "h-10 w-full min-w-0 rounded-lg border border-white/10 bg-black px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25";

function emptyDraft(): DraftUser {
  return { id: crypto.randomUUID(), name: "", email: "", jobTitle: "", permission: "member" };
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
  const currentMembership = members.find((member) => member.userId === currentUserId);
  const canManage = currentMembership?.role === "owner" || currentMembership?.role === "admin";

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
        setInvitations([]);
        return;
      }
      const [memberResult, invitationResult] = await Promise.all([
        authClient.organization.listMembers({ query: { organizationId: nextOrganization.id, limit: 100 } }),
        authClient.organization.listInvitations({ query: { organizationId: nextOrganization.id } }),
      ]);
      if (memberResult.error) throw new Error("members");
      setMembers(((memberResult.data?.members ?? []) as OrganizationMember[]));
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

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-6"><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Empresa</p><h3 className="mt-2 text-xl font-semibold text-zinc-100">{organization.name}</h3><p className="mt-1 text-sm text-zinc-400">{members.length} {members.length === 1 ? "usuário vinculado" : "usuários vinculados"}</p></section>

      {canManage && <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-5">
        <h3 className="mb-4 text-sm font-semibold text-zinc-200">Adicionar usuário</h3>
        <div className="grid gap-3 sm:grid-cols-2"><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Nome" className={inputClass} /><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="E-mail" className={inputClass} /><input value={inviteJobTitle} onChange={(event) => setInviteJobTitle(event.target.value)} placeholder="Cargo / função" className={inputClass} /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "member" | "admin")} className={inputClass}><option value="member">Usuário</option><option value="admin">Administrador</option></select></div>
        <button type="button" disabled={inviting} onClick={() => void handleInvite()} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">{inviting ? "Adicionando..." : "Adicionar usuário"}</button>
        {inviteMessage && <p className="mt-3 text-sm text-zinc-400">{inviteMessage}</p>}
      </section>}

      <section className="min-w-0">
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">Usuários da empresa</h3>
        <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-white/[0.04] text-zinc-400"><tr><th className="px-4 py-3 font-medium">Nome</th><th className="px-4 py-3 font-medium">E-mail</th><th className="px-4 py-3 font-medium">Cargo</th><th className="px-4 py-3 font-medium">Permissão</th><th className="px-4 py-3 font-medium">Ações</th></tr></thead><tbody className="divide-y divide-white/5">
          {members.map((member) => <tr key={member.id}><td className="px-4 py-3 text-zinc-100">{member.user.name}</td><td className="px-4 py-3 text-zinc-400">{member.user.email}</td><td className="px-4 py-3 text-zinc-400">{member.jobTitle || "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${member.role === "owner" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.06] text-zinc-400"}`}>{roleLabel(member.role)}</span></td><td className="px-4 py-3"><div className="flex gap-2">{canManage && member.role !== "owner" && <><button type="button" disabled={busyId === member.id} onClick={() => void updateRole(member)} className="whitespace-nowrap rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50">{member.role === "admin" ? "Remover admin" : "Tornar admin"}</button><button type="button" disabled={busyId === member.id} onClick={() => void removeMember(member)} className="rounded-md border border-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">Remover</button></>}</div></td></tr>)}
        </tbody></table></div>
      </section>

      {invitations.length > 0 && <section><h3 className="mb-3 text-sm font-semibold text-zinc-200">Aguardando entrada</h3><div className="divide-y divide-white/5 rounded-xl border border-white/10">{invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate text-sm text-zinc-100">{invitation.name || invitation.email}</p><p className="truncate text-xs text-zinc-500">{invitation.email}{invitation.jobTitle ? ` · ${invitation.jobTitle}` : ""} · {roleLabel(invitation.role)}</p></div>{canManage && <button type="button" disabled={busyId === invitation.id} onClick={() => void cancelInvitation(invitation.id)} className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-50">Cancelar</button>}</div>)}</div></section>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
