"use client";

import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { LoginForm } from "@/components/auth/login-form";
import { LoginBackground } from "@/components/auth/login-background";
import styles from "@/components/auth/login-layout.module.css";

const geist = localFont({
  src: "../fonts/geist-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isPending && session) {
      router.replace("/");
    }
  }, [isPending, session, router]);

  async function handleSubmit() {
    if (!showPassword) {
      if (!email.trim()) return;
      setEmail(email.trim());
      setError(null);
      setShowPassword(true);
      return;
    }

    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });

      if (signInError) {
        setError("E-mail ou senha inválidos.");
        return;
      }

      router.replace("/");
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (signInError) setError("Não foi possível entrar com Google. Tente novamente.");
    } catch {
      setError("Não foi possível entrar com Google. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main lang="pt-BR" className={`${styles.page} ${geist.className}`}>
      <LoginBackground />
      <div className={styles.container}>
        <div className={styles.logoStage}>
          <span role="img" aria-label="CotrimBot" className={styles.logo} />
        </div>
        <LoginForm
          email={email}
          password={password}
          showPassword={showPassword}
          loading={loading}
          error={error}
          onEmailChange={(value) => {
            setEmail(value);
            setShowPassword(false);
            setPassword("");
            setError(null);
          }}
          onPasswordChange={(value) => {
            setPassword(value);
            setError(null);
          }}
          onSubmit={handleSubmit}
          onGoogleSignIn={handleGoogleSignIn}
        />
      </div>
    </main>
  );
}
