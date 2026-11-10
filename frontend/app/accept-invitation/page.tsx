"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Check, LoaderCircle, Mail } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type InvitationInfo = {
  email: string;
  name?: string | null;
  jobTitle?: string | null;
  organizationName: string;
  userExists: boolean;
};

const inputClassName =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-white/25 disabled:opacity-60";
const buttonClassName =
  "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500";

function InvitationSummary({ invitation }: { invitation: InvitationInfo }) {
  return (
    <div className="mb-7 text-center">
      <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400">
        <Mail size={17} aria-hidden="true" />
      </span>
      <p className="text-sm text-zinc-400">Convite para participar de</p>
      <p className="mt-1 text-base font-medium text-zinc-100">{invitation.organizationName}</p>
      <p className="mt-1.5 text-xs text-zinc-600">{invitation.email}</p>
    </div>
  );
}

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get("id");
  const { data: session } = useSession();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loadingInvitation, setLoadingInvitation] = useState(Boolean(invitationId));
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!invitationId) {
      return;
    }

    let cancelled = false;

    fetch(`${API_URL}/invitations/${encodeURIComponent(invitationId)}`)
      .then(async (response) => (response.ok ? ((await response.json()) as InvitationInfo) : null))
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setInvitation(data);
        if (data?.name) setName(data.name);
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
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500"><LoaderCircle size={16} className="animate-spin" /> Carregando convite</div>;
  }

  if (!invitationId || !invitation) {
    return <p className="rounded-xl border border-red-400/10 bg-red-400/[0.05] px-4 py-3 text-center text-sm text-red-300">Convite inválido ou expirado.</p>;
  }

  if (done) {
    return <div className="py-10 text-center"><span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><Check size={18} /></span><p className="text-sm font-medium text-zinc-100">Convite aceito</p><p className="mt-1 text-xs text-zinc-500">Redirecionando...</p></div>;
  }

  if (invitation.userExists) {
    const sessionMatches = session?.user?.email?.toLowerCase() === invitation.email.toLowerCase();

    return (
      <div>
        <InvitationSummary invitation={invitation} />
        {sessionMatches ? (
          <div className="space-y-3">
            {error && <p role="alert" className="rounded-lg bg-red-400/[0.07] px-3 py-2 text-center text-xs text-red-300">{error}</p>}
            <button type="button" disabled={submitting} onClick={() => void handleAcceptWithSession()} className={buttonClassName}>
              {submitting && <LoaderCircle size={15} className="animate-spin" />}
              {submitting ? "Aceitando..." : "Aceitar convite"}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-center text-sm leading-6 text-zinc-500">
            Já existe uma conta com este e-mail. <Link href="/login" className="font-medium text-zinc-200 hover:text-white">Entre na sua conta</Link> e abra este link novamente.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <InvitationSummary invitation={invitation} />
      <form onSubmit={(event) => { event.preventDefault(); void handleCreateAccount(); }} className="space-y-4">
        <label htmlFor="invite-name" className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500">Nome</span>
          <input id="invite-name" type="text" autoComplete="name" placeholder="Seu nome completo" disabled={submitting} value={name} onChange={(event) => setName(event.target.value)} className={inputClassName} />
        </label>
        <label htmlFor="invite-password" className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500">Senha</span>
          <input id="invite-password" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" disabled={submitting} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClassName} />
        </label>
        <label htmlFor="invite-password-confirm" className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500">Confirmar senha</span>
          <input id="invite-password-confirm" type="password" autoComplete="new-password" placeholder="Digite a senha novamente" disabled={submitting} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClassName} />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-400/[0.07] px-3 py-2 text-center text-xs text-red-300">{error}</p>}
        <button type="submit" disabled={submitting || !name.trim() || !password || !confirmPassword} className={buttonClassName}>
          {submitting && <LoaderCircle size={15} className="animate-spin" />}
          {submitting ? "Criando conta..." : "Criar conta"}
        </button>
        <p className="text-center text-[11px] leading-4 text-zinc-700">Ao continuar, você entrará automaticamente na empresa.</p>
      </form>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#050505] px-5 py-12 font-sans text-zinc-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.045),transparent_68%)]" />
      <div className="relative w-full max-w-[380px]">
        <div className="mb-10 text-center">
          <p className="text-xs font-medium tracking-[0.16em] text-zinc-600">COTRIMBOT</p>
          <h1 className="mt-3 text-2xl font-medium tracking-[-0.035em] text-zinc-100">Aceitar convite</h1>
        </div>
        <Suspense fallback={<div className="py-16 text-center text-sm text-zinc-500">Carregando...</div>}>
          <AcceptInvitationForm />
        </Suspense>
        <p className="mt-8 text-center text-xs text-zinc-700">
          Já possui uma conta? <Link href="/login" className="font-medium text-zinc-500 transition-colors hover:text-zinc-200">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
