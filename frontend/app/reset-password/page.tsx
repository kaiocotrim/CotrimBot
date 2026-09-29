"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!token) {
      setError("Link inválido ou expirado.");
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

    setLoading(true);
    setError(null);

    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });

    setLoading(false);

    if (resetError) {
      setError("Não foi possível definir a senha. Solicite um novo link.");
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/login"), 2000);
  }

  if (!token) {
    return <p className="text-sm text-red-400">Link inválido ou expirado.</p>;
  }

  if (done) {
    return <p className="text-sm text-emerald-400">Senha definida! Redirecionando para o login...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="reset-password" className="sr-only">Nova senha</label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          placeholder="Nova senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-12 w-full rounded-2xl border border-[#ededed]/10 bg-[#ededed]/6 px-5 text-base text-[#ededed] outline-none placeholder:text-[#ededed]/40 focus:border-[#ededed]/30"
        />
      </div>
      <div>
        <label htmlFor="reset-password-confirm" className="sr-only">Confirmar senha</label>
        <input
          id="reset-password-confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Confirme a nova senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void handleSubmit(); }}
          className="h-12 w-full rounded-2xl border border-[#ededed]/10 bg-[#ededed]/6 px-5 text-base text-[#ededed] outline-none placeholder:text-[#ededed]/40 focus:border-[#ededed]/30"
        />
      </div>
      {error && <p role="alert" className="text-center text-xs text-red-400">{error}</p>}
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleSubmit()}
        className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#ededed]/15 px-5 text-base font-semibold text-[#ededed]/80 transition-colors hover:bg-[#ededed]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Salvando..." : "Definir senha"}
      </button>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 font-sans text-[#ededed]">
      <div className="w-full max-w-[360px]">
        <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight">Definir senha</h1>
        <Suspense fallback={<p className="text-sm text-zinc-400">Carregando...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-6 text-center text-xs text-[#ededed]/40">
          <Link href="/login" className="font-semibold hover:text-[#ededed]/70">Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}
