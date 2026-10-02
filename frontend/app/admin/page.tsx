"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
};

type PendingInvitation = {
  id: string;
  email: string;
  role?: string | null;
  status: string;
  expiresAt: string | Date;
};

export default function AdminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "admin";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: listError } = await authClient.admin.listUsers({
      query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" },
    });

    if (listError) {
      setError("Não foi possível carregar os usuários.");
    } else {
      setUsers((data?.users as AdminUser[]) ?? []);
    }

    setLoading(false);
  }, []);

  const loadInvitations = useCallback(async (orgId: string) => {
    const { data } = await authClient.organization.listInvitations({ query: { organizationId: orgId } });
    setInvitations(((data ?? []) as PendingInvitation[]).filter((invitation) => invitation.status === "pending"));
  }, []);

  const loadOrganization = useCallback(async () => {
    const { data } = await authClient.organization.list();
    const orgId = data?.[0]?.id ?? null;

    setOrganizationId(orgId);
    if (orgId) {
      await loadInvitations(orgId);
    }
  }, [loadInvitations]);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
      return;
    }
    if (!isPending && session && !isAdmin) {
      router.replace("/");
      return;
    }
    if (isAdmin) {
      void loadUsers();
      void loadOrganization();
    }
  }, [isPending, session, isAdmin, router, loadUsers, loadOrganization]);

  async function toggleRole(user: AdminUser) {
    const nextRole = user.role === "admin" ? "user" : "admin";
    setBusyUserId(user.id);
    await authClient.admin.setRole({ userId: user.id, role: nextRole });
    await loadUsers();
    setBusyUserId(null);
  }

  async function toggleBan(user: AdminUser) {
    setBusyUserId(user.id);
    if (user.banned) {
      await authClient.admin.unbanUser({ userId: user.id });
    } else {
      const reason = window.prompt("Motivo do bloqueio (opcional):") ?? undefined;
      await authClient.admin.banUser({ userId: user.id, banReason: reason || undefined });
    }
    await loadUsers();
    setBusyUserId(null);
  }

  async function removeUser(user: AdminUser) {
    if (user.id === session?.user?.id) {
      window.alert("Você não pode excluir a própria conta.");
      return;
    }
    if (!window.confirm(`Excluir permanentemente ${user.name} (${user.email})?`)) {
      return;
    }

    setBusyUserId(user.id);
    await authClient.admin.removeUser({ userId: user.id });
    await loadUsers();
    setBusyUserId(null);
  }

  async function handleInvite() {
    const email = inviteEmail.trim();

    if (!email) {
      setInviteError("Informe o e-mail do convidado.");
      return;
    }
    if (!organizationId) {
      setInviteError("Nenhuma organização encontrada para a sua conta. Execute o seed (npm run prisma:seed).");
      return;
    }

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const { error: inviteResultError } = await authClient.organization.inviteMember({
        email,
        role: inviteRole,
        organizationId,
        resend: true,
      });

      if (inviteResultError) {
        setInviteError(inviteResultError.message ?? "Não foi possível enviar o convite.");
        return;
      }

      setInviteSuccess(`Convite enviado para ${email}.`);
      setInviteEmail("");
      await loadInvitations(organizationId);
    } catch {
      setInviteError("Não foi possível conectar ao servidor.");
    } finally {
      setInviting(false);
    }
  }

  async function cancelInvitation(invitationId: string) {
    if (!organizationId) return;

    setBusyUserId(invitationId);
    await authClient.organization.cancelInvitation({ invitationId });
    await loadInvitations(organizationId);
    setBusyUserId(null);
  }

  if (isPending || !session || !isAdmin) {
    return (
      <main className="flex h-dvh items-center justify-center bg-zinc-950 text-white">
        <p className="text-sm text-zinc-400">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <Link href="/" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">
            Voltar para o chat
          </Link>
        </div>

        <div className="mb-8 rounded-xl border border-white/10 p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Convidar usuário</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              placeholder="E-mail"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="h-10 flex-1 rounded-lg border border-white/10 bg-white/4 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/20"
            />
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as "member" | "admin")}
              className="h-10 rounded-lg border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-white/20"
            >
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              disabled={inviting}
              onClick={() => void handleInvite()}
              className="h-10 shrink-0 rounded-lg bg-emerald-500/15 px-4 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {inviting ? "Enviando..." : "Enviar convite"}
            </button>
          </div>
          {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
          {inviteSuccess && <p className="mt-2 text-xs text-emerald-400">{inviteSuccess}</p>}

          {invitations.length > 0 && (
            <ul className="mt-4 divide-y divide-white/5 border-t border-white/10">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-zinc-100">{invitation.email}</p>
                    <p className="text-xs text-zinc-500">
                      {invitation.role === "admin" ? "Admin" : "Membro"} · expira em {new Date(invitation.expiresAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyUserId === invitation.id}
                    onClick={() => void cancelInvitation(invitation.id)}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/6 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loading && <p className="text-sm text-zinc-400">Carregando usuários...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Papel</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-zinc-100">{user.name}</td>
                    <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${user.role === "admin" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.06] text-zinc-400"}`}>
                        {user.role === "admin" ? "Admin" : "Usuário"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.banned ? (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400" title={user.banReason ?? undefined}>
                          Bloqueado
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-400">Ativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyUserId === user.id}
                          onClick={() => void toggleRole(user)}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          {user.role === "admin" ? "Remover admin" : "Tornar admin"}
                        </button>
                        <button
                          type="button"
                          disabled={busyUserId === user.id}
                          onClick={() => void toggleBan(user)}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          {user.banned ? "Desbloquear" : "Bloquear"}
                        </button>
                        <button
                          type="button"
                          disabled={busyUserId === user.id}
                          onClick={() => void removeUser(user)}
                          className="rounded-md border border-red-500/20 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
