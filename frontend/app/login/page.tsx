"use client";

import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import { authClient, useSession } from "@/lib/auth-client";
import { LoginForm } from "@/components/auth/login-form";
import { LoginBackground } from "@/components/auth/login-background";
import { LiquidGlassLogo } from "@/components/liquid-glass-logo";
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
  const [introComplete, setIntroComplete] = useState(false);
  const logoAnchor = useRef<HTMLDivElement>(null);
  const glassFinished = useRef(false);
  const logoX = useMotionValue(0);
  const logoY = useMotionValue(0);

  useLayoutEffect(() => {
    const anchor = logoAnchor.current;
    if (!anchor) return;
    const centerLogo = () => {
      if (glassFinished.current) return;
      const bounds = anchor.getBoundingClientRect();
      logoX.set(window.innerWidth / 2 - bounds.x - bounds.width / 2);
      logoY.set(window.innerHeight / 2 - bounds.y - bounds.height / 2);
    };
    centerLogo();
    const observer = new ResizeObserver(centerLogo);
    observer.observe(anchor);
    window.addEventListener("resize", centerLogo);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", centerLogo);
      logoX.stop();
      logoY.stop();
      glassFinished.current = false;
    };
  }, [logoX, logoY]);

  function positionFinishedLogo() {
    if (glassFinished.current) return;
    glassFinished.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      logoX.set(0);
      logoY.set(0);
      setIntroComplete(true);
      return;
    }
    const transition = { duration: .85, ease: [.22, 1, .36, 1] as const };
    animate(logoX, 0, transition);
    animate(logoY, 0, { ...transition, onComplete: () => setIntroComplete(true) });
  }
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
    <main lang="pt-BR" className={`${styles.page} ${geist.className}`} data-intro-complete={introComplete}>
      <div className={styles.backgroundReveal} aria-hidden="true"><LoginBackground /></div>
      <div className={styles.container}>
        <div className={styles.logoStage}>
          <div ref={logoAnchor} className={styles.logoAnchor}>
          <motion.div className={styles.logoFlight} style={{ x: logoX, y: logoY }}>
          <LiquidGlassLogo
            logo="/Logo-CotrimBot-nova.png"
            ending="logo"
            theme="light"
            depth={2.9}
            background="#000000"
            logoColor="original"
            logoSize={360}
            logoScale={1}
            mark=""
            text=""
            finalLogoScale={1}
            className={styles.glassLogo}
            style={{ height: "100%", background: "transparent" }}
            aria-label="CotrimBot"
            onComplete={positionFinishedLogo}
          />
          </motion.div>
          </div>
        </div>
        <div className={styles.formReveal} inert={!introComplete} aria-hidden={!introComplete}>
        <LoginForm
          email={email}
          password={password}
          showPassword={showPassword}
          loading={loading}
          error={error}
          onEmailChange={(value) => {
            setEmail(value);
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
      </div>
    </main>
  );
}
