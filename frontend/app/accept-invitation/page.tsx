"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type InvitationInfo = {
  email: string;
  organizationName: string;
  userExists: boolean;
};

const inputClassName =
  "h-12 w-full rounded-2xl border border-[#ededed]/10 bg-[#ededed]/6 px-5 text-base text-[#ededed] outline-none placeholder:text-[#ededed]/40 focus:border-[#ededed]/30";
const buttonClassName =
  "flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#ededed]/15 px-5 text-base font-semibold text-[#ededed]/80 transition-colors hover:bg-[#ededed]/20 disabled:cursor-not-allowed disabled:opacity-60";

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get("id");
  const { data: session } = useSession();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loadingInvitation, setLoadingInvitation] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!invitationId) {
      setLoadingInvitation(false);
      return;
    }

    let cancelled = false;

    fetch(`${API_URL}/invitations/${encodeURIComponent(invitationId)}`)
      .then(async (response) => (response.ok ? ((await response.json()) as InvitationInfo) : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setInvitation(data);
        setLoadingInvitation(false);
      });

    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  function finish() {
    setDone(true);
    setTimeout(() => router.replace("/login"), 2000);
  }

  async function handleCreateAccount() {
    if (!invitationId) return;

    if (!name.trim()) {
      setError("Informe seu nome.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/invitations/${encodeURIComponent(invitationId)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Não foi possível aceitar o convite.");
        return;
      }

      finish();
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptWithSession() {
    if (!invitationId) return;

    setSubmitting(true);
    setError(null);

    try {
      const { error: acceptError } = await authClient.organization.acceptInvitation({ invitationId });

      if (acceptError) {
        setError(acceptError.message ?? "Não foi possível aceitar o convite.");
        return;
      }

      setDone(true);
      setTimeout(() => router.replace("/"), 2000);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingInvitation) {
    return <p className="text-center text-sm text-zinc-400">Carregando convite...</p>;
  }

  if (!invitationId || !invitation) {
    return <p className="text-center text-sm text-red-400">Convite inválido ou expirado.</p>;
  }

  if (done) {
    return <p className="text-center text-sm text-emerald-400">Convite aceito! Redirecionando...</p>;
  }

  const description = (
    <p className="mb-6 text-center text-sm text-[#ededed]/60">
      Você foi convidado para <strong className="text-[#ededed]">{invitation.organizationName}</strong> com o e-mail{" "}
      <strong className="text-[#ededed]">{invitation.email}</strong>.
    </p>
  );

  if (invitation.userExists) {
    const sessionMatches = session?.user?.email?.toLowerCase() === invitation.email.toLowerCase();

    return (
      <div className="space-y-4">
        {description}
        {sessionMatches ? (
          <>
            {error && <p role="alert" className="text-center text-xs text-red-400">{error}</p>}
            <button type="button" disabled={submitting} onClick={() => void handleAcceptWithSession()} className={buttonClassName}>
              {submitting ? "Aceitando..." : "Aceitar convite"}
            </button>
          </>
        ) : (
          <p className="text-center text-sm text-[#ededed]/60">
            Já existe uma conta com este e-mail. <Link href="/login" className="font-semibold text-[#ededed] hover:underline">Entre</Link> e abra este link novamente para aceitar o convite.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {description}
      <div>
        <label htmlFor="invite-name" className="sr-only">Nome</label>
        <input
          id="invite-name"
          type="text"
          autoComplete="name"
          placeholder="Seu nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClassName}
        />
      </div>
      <div>
        <label htmlFor="invite-password" className="sr-only">Senha</label>
        <input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          placeholder="Defina uma senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClassName}
        />
      </div>
      <div>
        <label htmlFor="invite-password-confirm" className="sr-only">Confirmar senha</label>
        <input
          id="invite-password-confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Confirme a senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void handleCreateAccount(); }}
          className={inputClassName}
        />
      </div>
      {error && <p role="alert" className="text-center text-xs text-red-400">{error}</p>}
      <button type="button" disabled={submitting} onClick={() => void handleCreateAccount()} className={buttonClassName}>
        {submitting ? "Salvando..." : "Criar conta e aceitar"}
      </button>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 font-sans text-[#ededed]">
      <div className="w-full max-w-[360px]">
        <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight">Aceitar convite</h1>
        <Suspense fallback={<p className="text-sm text-zinc-400">Carregando...</p>}>
          <AcceptInvitationForm />
        </Suspense>
        <p className="mt-6 text-center text-xs text-[#ededed]/40">
          <Link href="/login" className="font-semibold hover:text-[#ededed]/70">Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}
