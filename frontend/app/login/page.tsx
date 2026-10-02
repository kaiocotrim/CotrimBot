"use client";

import { LoginBackground } from "@/components/auth/login-background";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { motion, MotionConfig, stagger, useReducedMotion, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";

const loginEntrance: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
};

const loginDetails: Variants = {
  expanded: { height: "auto", opacity: 1, filter: "blur(0px)" },
  compact: { height: 0, opacity: 0, filter: "blur(10px)" },
};

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoginFocused, setIsLoginFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const detailsTransition = {
    duration: reduceMotion ? 0 : 0.55,
    ease: [0.22, 1, 0.36, 1] as const,
    opacity: { duration: reduceMotion ? 0 : 0.25 },
  };

  useEffect(() => {
    if (!isPending && session) {
      router.replace("/");
    }
  }, [isPending, session, router]);

  async function handleSubmit() {
    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.email({ email, password });

    setLoading(false);

    if (signInError) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    router.replace("/");
  }

  async function handleGoogleSignIn() {
    await authClient.signIn.social({ provider: "google", callbackURL: "/" });
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative isolate min-h-dvh overflow-x-clip bg-[#030807] font-sans text-[#ededed] selection:bg-[#03f183]/25 selection:text-white">
        <motion.div
          initial={{ opacity: 0, filter: "blur(8px) brightness(1)" }}
          animate={{
            opacity: 1,
            filter: isLoginFocused ? "blur(14px) brightness(0.7)" : "blur(8px) brightness(1)",
          }}
          transition={{
            opacity: { duration: 1.2 },
            filter: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
          }}
          className="pointer-events-none absolute inset-0"
        >
          <LoginBackground />
        </motion.div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { delayChildren: stagger(0.12, { startDelay: 0.15 }) } } }}
          className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-10 pb-[max(40px,env(safe-area-inset-bottom))] sm:py-12"
        >
          <motion.div variants={loginEntrance} className="flex w-full items-center justify-center pb-6">
            <div
              role="img"
              aria-label="CotrimBot"
              className="relative size-[130px] shrink-0 drop-shadow-[0_0_28px_rgba(3,241,131,0.45)] transition-transform duration-600 ease-out motion-safe:hover:[transform:perspective(800px)_rotateY(-8deg)_rotateX(5deg)] motion-reduce:transition-none sm:size-[160px]"
            >
              <div
                className="absolute inset-0"
                style={{
                  maskImage: "url('/Logo-CotrimBot.png')",
                  maskSize: "236% 236%",
                  maskPosition: "50% 53%",
                  maskRepeat: "no-repeat",
                  background: "linear-gradient(135deg, #a7ffd3 8%, #69efb5 30%, #03f183 52%, #00c56a 78%, #8fffc7 100%)",
                }}
              >
                <div
                  className="absolute inset-0 opacity-40 motion-safe:animate-pulse [animation-duration:9s]"
                  style={{ background: "radial-gradient(circle at 22% 38%, white 0 1px, transparent 2px), radial-gradient(circle at 30% 73%, white 0 1.5px, transparent 2.5px), radial-gradient(circle at 26% 68%, white 0 1px, transparent 2px), radial-gradient(circle at 71% 82%, white 0 1px, transparent 2px), linear-gradient(115deg, transparent 20%, #fff8 48%, transparent 65%)" }}
                />
              </div>
            </div>
          </motion.div>

          <section aria-label="Login no CotrimBot" className="w-full max-w-[360px] shrink-0">
            <motion.div
              initial={false}
              animate={isLoginFocused ? "compact" : "expanded"}
              variants={loginDetails}
              transition={detailsTransition}
              aria-hidden={isLoginFocused}
              className="overflow-hidden"
            >
              <motion.p variants={loginEntrance} className="mb-6 text-center text-[38px] leading-none font-semibold tracking-[-0.06em] text-white sm:text-[44px]">Cotrim<span className="text-[#ada8c1]">Bot</span></motion.p>
              <motion.h1 variants={loginEntrance} id="login-title" className="text-center text-[30px] leading-[1.15] font-semibold tracking-tight text-white sm:text-[34px]">
                Converse, automatize<br />e evolua <span className="bg-linear-to-r from-[#b8efd3] to-[#8edbb7] bg-clip-text text-transparent">com IA</span>
              </motion.h1>
              <motion.p variants={loginEntrance} className="mt-3 mb-7 text-center text-sm leading-relaxed text-[#bac8c2]">
                Atendimento inteligente para WhatsApp.<br />Automação e transcrição de áudio em um só lugar.
              </motion.p>
            </motion.div>

            <motion.div
              initial={false}
              animate={isLoginFocused ? "expanded" : "compact"}
              variants={loginDetails}
              transition={detailsTransition}
              aria-hidden={!isLoginFocused}
              className="overflow-hidden"
            >
              <h2 className="mb-6 text-center text-2xl leading-tight font-semibold tracking-tight text-white">
                Preencha com o seu login
              </h2>
            </motion.div>

            <motion.div
              variants={loginEntrance}
              role="group"
              aria-label="Acesso ao CotrimBot"
              className="space-y-4"
              onFocusCapture={(event) => {
                if (event.target instanceof HTMLInputElement) setIsLoginFocused(true);
              }}
              onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  setIsLoginFocused(false);
                }
              }}
            >
              <div className="grid grid-cols-3 gap-3">
                <button type="button" aria-label="Continuar com Google" onClick={handleGoogleSignIn} className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white px-5 text-black transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8a1ff] motion-reduce:transition-none">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5"><path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" /><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" /><path fill="#fbbc05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" /><path fill="#ea4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z" /></svg>
                </button>
                <button type="button" disabled aria-label="Continuar com Apple (em breve)" className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full border border-black/10 bg-white/60 px-5 text-black/40 motion-reduce:transition-none">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5"><path d="M17.05 12.54c.03 3.18 2.79 4.24 2.82 4.25-.02.08-.44 1.51-1.45 2.99-.88 1.28-1.79 2.56-3.23 2.59-1.42.03-1.88-.84-3.51-.84-1.62 0-2.13.81-3.48.87-1.39.05-2.45-1.39-3.34-2.67-1.81-2.62-3.19-7.4-1.33-10.63a5.18 5.18 0 0 1 4.37-2.65c1.37-.03 2.66.93 3.5.93.83 0 2.4-1.15 4.05-.98.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.28 4.03ZM14.38 4.67c.74-.9 1.25-2.15 1.11-3.4-1.07.04-2.36.71-3.13 1.61-.69.8-1.3 2.07-1.14 3.3 1.19.1 2.41-.62 3.16-1.51Z" /></svg>
                </button>
                <button type="button" disabled aria-label="Continuar com X (em breve)" className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full border border-black/10 bg-white/60 px-5 text-black/40 motion-reduce:transition-none">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-7.4L5.6 22H2.47l7.98-9.13L2.8 2h6.4l4.43 6.77L18.9 2Zm-1.1 18h1.73L8.25 3.9H6.39L17.8 20Z" /></svg>
                </button>
              </div>

              <div className="flex items-center gap-3 py-1">
                <span aria-hidden="true" className="h-px flex-1 bg-[#ededed]/15" />
                <span className="text-xs text-[#a3a3a3]">ou</span>
                <span aria-hidden="true" className="h-px flex-1 bg-[#ededed]/15" />
              </div>

              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute top-4 left-4 z-10 size-4 text-[#a1afa9]" />
                <label htmlFor="login-email" className="sr-only">Endereço de e-mail</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Endereço de e-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/15 bg-[#101719]/80 pr-5 pl-11 text-base text-[#ededed] caret-[#8fffc7] backdrop-blur-xl transition-colors outline-none placeholder:text-[#ededed]/40 focus:border-[#69efb5]/60 focus:bg-[#152320]/90 motion-reduce:transition-none"
                />
              </div>

              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute top-4 left-4 z-10 size-4 text-[#a1afa9]" />
                <label htmlFor="login-password" className="sr-only">Senha</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void handleSubmit(); }}
                  className="h-12 w-full rounded-2xl border border-white/15 bg-[#101719]/80 pr-5 pl-11 text-base text-[#ededed] caret-[#8fffc7] backdrop-blur-xl transition-colors outline-none placeholder:text-[#ededed]/40 focus:border-[#69efb5]/60 focus:bg-[#152320]/90 motion-reduce:transition-none"
                />
              </div>

              {error && (
                <p role="alert" className="text-center text-xs text-red-400">{error}</p>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSubmit()}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-white/40 bg-linear-to-r from-[#deedff] via-[#d9d0ff] to-[#f0dbff] px-5 text-base font-semibold text-[#141324] shadow-[0_0_28px_rgba(175,148,255,0.22)] transition hover:brightness-110 hover:shadow-[0_0_36px_rgba(175,148,255,0.35)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8a1ff] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Continuar"}
                {!loading && <ArrowRight aria-hidden="true" className="size-4" />}
              </button>
            </motion.div>

            <motion.div
              initial={false}
              animate={isLoginFocused ? "compact" : "expanded"}
              variants={loginDetails}
              transition={detailsTransition}
              aria-hidden={isLoginFocused}
              inert={isLoginFocused}
              className="overflow-hidden"
            >
              <motion.p variants={loginEntrance} className="mt-5 text-center text-[11px] leading-relaxed text-[#ededed]/40 sm:text-xs">
                Ao continuar, você concorda com os nossos<br />
                <button type="button" className="cursor-pointer rounded-sm font-semibold text-[#ededed]/60 transition-colors hover:text-[#ededed]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8a1ff] motion-reduce:transition-none">Termos de Uso</button>
                {" e "}
                <button type="button" className="cursor-pointer rounded-sm font-semibold text-[#ededed]/60 transition-colors hover:text-[#ededed]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8a1ff] motion-reduce:transition-none">Política de Privacidade</button>.
              </motion.p>
            </motion.div>
          </section>
        </motion.div>
      </main>
    </MotionConfig>
  );
}
