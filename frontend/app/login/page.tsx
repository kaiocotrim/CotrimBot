"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <main className="relative isolate min-h-dvh overflow-x-clip bg-black font-sans text-[#ededed] selection:bg-[#03f183]/25 selection:text-white">
      {/* Decorative conversations follow the reference's four tilted columns. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 isolate overflow-hidden select-none">
        <div className="absolute top-[44%] left-[52%] h-[152%] w-[420%] -translate-x-1/2 -translate-y-1/2 rotate-[20deg] sm:w-[280%] md:w-[200%] lg:w-[140%]">
          <div className="grid h-full grid-cols-4 gap-2 p-8">
            {[
              [
                { kind: "chat", theme: "dark", name: "Marina", initials: "MA", message: "Oi! Podemos conversar?", reply: "Claro. Estamos por aqui!", caption: "Cada conversa importa." },
                { kind: "voice", theme: "mint", name: "Uma mensagem de voz", initials: "", message: "", reply: "", caption: "Mais perto, mesmo de longe." },
                { kind: "automation", theme: "lavender", name: "Tudo flui.", initials: "", message: "Nova mensagem", reply: "Resposta enviada", caption: "Você cuida do que importa." },
              ],
              [
                { kind: "automation", theme: "dark", name: "Uma conexão.\nMuitas possibilidades.", initials: "", message: "Conversa iniciada", reply: "CotrimBot conectado", caption: "Sempre por perto." },
                { kind: "chat", theme: "mint", name: "Luiza", initials: "LU", message: "Olá! Queria saber mais.", reply: "Oi, Luiza! Como posso ajudar?", caption: "Boas conversas começam aqui." },
                { kind: "whatsapp", theme: "dark", name: "Seu WhatsApp.\nAinda mais próximo.", initials: "", message: "", reply: "", caption: "CotrimBot" },
              ],
              [
                { kind: "whatsapp", theme: "mint", name: "Conecte.\nConverse.\nSimplifique.", initials: "", message: "", reply: "", caption: "CotrimBot + WhatsApp" },
                { kind: "voice", theme: "dark", name: "Pode falar. Estamos aqui.", initials: "", message: "", reply: "", caption: "Conexões de verdade." },
                { kind: "chat", theme: "cream", name: "Pedro", initials: "PE", message: "Tudo certo por aqui!", reply: "Perfeito. Conte com a gente.", caption: "Um atendimento mais humano." },
              ],
              [
                { kind: "chat", theme: "lavender", name: "Ana", initials: "AN", message: "Obrigada pela ajuda!", reply: "É sempre bom conversar com você.", caption: "Presente em cada mensagem." },
                { kind: "automation", theme: "mint", name: "Menos tarefas.\nMais conversas.", initials: "", message: "Mensagem recebida", reply: "Tudo resolvido", caption: "Deixe o resto com o CotrimBot." },
                { kind: "voice", theme: "dark", name: "A conversa continua.", initials: "", message: "", reply: "", caption: "No seu tempo. Do seu jeito." },
              ],
            ].map((cards, columnIndex) => (
              <div key={columnIndex} className="h-full overflow-hidden">
                {/* Equal duplicate groups make the existing enter keyframe loop seamlessly. */}
                <div
                  className={`px-3 ease-linear motion-safe:animate-in motion-safe:slide-in-from-top-1/2 motion-safe:duration-[110000ms] motion-safe:repeat-infinite ${columnIndex % 2 === 0 ? "motion-safe:direction-reverse" : "motion-safe:direction-normal"}`}
                >
                  {[0, 1].map((copy) => (
                    <div key={copy}>
                      {cards.map((card, cardIndex) => (
                        <div
                          key={`${copy}-${cardIndex}`}
                          className={`relative mb-6 aspect-[4/3] overflow-hidden rounded-[28px] border shadow-xl after:absolute after:inset-0 after:bg-linear-to-b after:from-transparent after:via-black/5 after:to-black/20 ${
                            card.theme === "dark"
                              ? "border-white/8 bg-[#101a17] text-[#e0ebe5]"
                              : card.theme === "mint"
                                ? "border-white/10 bg-[#d7ece0] text-[#194532]"
                                : card.theme === "lavender"
                                  ? "border-white/10 bg-[#e0dfee] text-[#373449]"
                                  : "border-white/10 bg-[#f1eee3] text-[#3e493a]"
                          }`}
                        >
                          <div
                            className="flex h-full flex-col justify-center p-[8%] ease-in-out motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:duration-[4500ms] motion-safe:repeat-infinite motion-safe:direction-alternate"
                            style={{ animationDelay: `${(columnIndex + cardIndex) * -2}s` }}
                          >
                            {card.kind === "chat" && (
                              <>
                                <div className="mb-6 flex items-center gap-3">
                                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${card.theme === "dark" ? "bg-[#b6dbc2]/15 text-[#b6dbc2]" : "bg-black/8 text-current"}`}>
                                    {card.initials}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold">{card.name}</p>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] opacity-60"><span className="size-1.5 rounded-full bg-[#48a979]" />online agora</p>
                                  </div>
                                  <svg className="ml-auto size-5 opacity-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z" /></svg>
                                </div>
                                <div className={`max-w-[85%] self-start rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed ${card.theme === "dark" ? "bg-white/8" : "bg-white/65"}`}>
                                  {card.message}
                                </div>
                                <div className={`mt-3 max-w-[88%] self-end rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed ${card.theme === "dark" ? "bg-[#244e3b] text-[#dff1e6]" : "bg-[#a9d7b8] text-[#234b35]"}`}>
                                  {card.reply}
                                  <span className="mt-1 flex items-center justify-end gap-1 text-[9px] opacity-60">09:41<svg className="h-3 w-4" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m1 7 4 4L15 1M9 9l2 2 8-9" /></svg></span>
                                </div>
                                <div className={`mt-3 flex w-fit gap-1 rounded-2xl rounded-bl-sm px-3.5 py-3 ${card.theme === "dark" ? "bg-white/8" : "bg-white/60"}`}>
                                  <span className="size-1.5 rounded-full bg-current opacity-40 motion-safe:animate-pulse" />
                                  <span className="size-1.5 rounded-full bg-current opacity-40 motion-safe:animate-pulse [animation-delay:300ms]" />
                                  <span className="size-1.5 rounded-full bg-current opacity-40 motion-safe:animate-pulse [animation-delay:600ms]" />
                                </div>
                              </>
                            )}
                            {card.kind === "voice" && (
                              <>
                                <div className="mb-7 flex items-center gap-2 text-[10px] font-medium tracking-[0.18em] uppercase opacity-50">
                                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>Mensagem de voz
                                </div>
                                <p className="max-w-[240px] text-[26px] leading-[1.12] font-medium tracking-tight">{card.name}</p>
                                <div className={`mt-6 flex items-center gap-4 rounded-2xl rounded-bl-sm p-4 ${card.theme === "dark" ? "bg-[#254a38]" : "bg-white/65"}`}>
                                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${card.theme === "dark" ? "bg-[#d3e6d8] text-[#224231]" : "bg-[#315c43] text-[#e3efe7]"}`}><svg className="ml-0.5 size-4" viewBox="0 0 20 20" fill="currentColor"><path d="m6 3 11 7-11 7V3Z" /></svg></span>
                                  <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px]">
                                    {[8, 14, 20, 10, 24, 31, 16, 12, 23, 29, 18, 9, 15, 26, 32, 21, 13, 24, 17, 10, 20, 28, 15, 9].map((height, index) => (
                                      <span key={index} className="w-[3px] flex-1 rounded-full bg-current" style={{ height, opacity: index < 15 ? 0.65 : 0.25 }} />
                                    ))}
                                  </div>
                                  <span className="text-[10px] opacity-60">0:24</span>
                                </div>
                                <p className="mt-5 text-[11px] opacity-45">{card.caption}</p>
                              </>
                            )}
                            {card.kind === "automation" && (
                              <>
                                <div className="mb-5 flex items-center gap-2 text-[10px] font-medium tracking-[0.18em] uppercase opacity-50">
                                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" /></svg>Automação com cuidado
                                </div>
                                <p className="text-[28px] leading-[1.12] font-medium tracking-tight whitespace-pre-line">{card.name}</p>
                                <div className="mt-6 flex items-center gap-2">
                                  <div className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border p-3 text-center text-[10px] ${card.theme === "dark" ? "border-white/10 bg-white/5" : "border-black/5 bg-white/55"}`}>
                                    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.1-4.4A8.5 8.5 0 1 1 20 11.5Z" /><path d="M8 9h7M8 13h4" /></svg>
                                    {card.message}
                                  </div>
                                  <span className="flex items-center gap-1 opacity-35"><span className="h-px w-3 bg-current" /><span className="size-1 rounded-full bg-current" /><span className="h-px w-3 bg-current" /></span>
                                  <div className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border p-3 text-center text-[10px] ${card.theme === "dark" ? "border-[#8ccb9f]/20 bg-[#31563f]/40 text-[#aaddb9]" : "border-[#7cb591]/20 bg-[#b2d7bc]/55 text-[#28533b]"}`}>
                                    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
                                    {card.reply}
                                  </div>
                                </div>
                                <p className="mt-5 text-[11px] opacity-45">{card.caption}</p>
                              </>
                            )}
                            {card.kind === "whatsapp" && (
                              <>
                                <div className="mb-5 flex items-center gap-2 text-[10px] font-medium tracking-[0.18em] uppercase opacity-50"><span className="size-1.5 rounded-full bg-current" />{card.caption}</div>
                                <div className="flex items-center justify-between gap-4">
                                  <p className="text-[34px] leading-[1.08] font-medium tracking-[-0.04em] whitespace-pre-line">{card.name}</p>
                                  <svg className="size-[35%] shrink-0 opacity-80" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M84 48a35 35 0 0 1-51 31L13 85l6-20A35 35 0 1 1 84 48Z" /><path d="m38 29-7 3c-5 12 12 31 26 35l8-6-1-7-11-4-5 5c-5-2-9-6-11-11l5-4-4-11Z" /></svg>
                                </div>
                                <p className="mt-7 text-[11px] opacity-50">Pessoas perto. Conversas em dia.</p>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 0%, transparent 48%, rgb(0 0 0 / 0.78) 70%, #000 95%)" }} />
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-t from-black via-black/20 via-20% to-transparent to-55%" />

      <div className="relative flex min-h-dvh flex-col items-center px-6 pt-12 pb-[max(24px,env(safe-area-inset-bottom))] sm:pt-16 sm:pb-10">
        <div className="flex w-full flex-1 items-center justify-center pb-12">
          <div
            role="img"
            aria-label="CotrimBot"
            className="relative size-[220px] shrink-0 drop-shadow-[0_18px_36px_rgba(0,0,0,0.24)] transition-transform duration-600 ease-out motion-safe:hover:[transform:perspective(800px)_rotateY(-8deg)_rotateX(5deg)] motion-reduce:transition-none sm:size-[300px]"
          >
            <div
              className="absolute inset-0"
              style={{
                maskImage: "url('/Logo-CotrimBot.png')",
                maskSize: "236% 236%",
                maskPosition: "50% 53%",
                maskRepeat: "no-repeat",
                background: "linear-gradient(125deg, #eef7f1 8%, #dbf0e2 28%, #ded8ed 48%, #c8e5dc 70%, #91e7b7 100%)",
              }}
            >
              <div
                className="absolute inset-0 opacity-40 motion-safe:animate-pulse [animation-duration:9s]"
                style={{ background: "radial-gradient(circle at 22% 38%, white 0 1px, transparent 2px), radial-gradient(circle at 30% 73%, white 0 1.5px, transparent 2.5px), radial-gradient(circle at 26% 68%, white 0 1px, transparent 2px), radial-gradient(circle at 71% 82%, white 0 1px, transparent 2px), linear-gradient(115deg, transparent 20%, #fff8 48%, transparent 65%)" }}
              />
            </div>
          </div>
        </div>

        <section aria-labelledby="login-title" className="w-full max-w-[360px] shrink-0">
          <h1 id="login-title" className="relative isolate mb-8 text-center text-[36px] leading-[1.1] font-semibold tracking-tight before:pointer-events-none before:absolute before:-inset-x-6 before:-inset-y-10 before:-z-10 before:bg-[radial-gradient(ellipse,#000_0%,transparent_70%)] before:opacity-70 sm:text-[40px] sm:before:-inset-x-12">
            Suas conversas<br />— no CotrimBot
          </h1>

          <div role="group" aria-label="Acesso ao CotrimBot" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <button type="button" aria-label="Continuar com Google" onClick={handleGoogleSignIn} className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white px-5 text-black transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b5e8cb] motion-reduce:transition-none">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5"><path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" /><path d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" /><path d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" /><path d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z" /></svg>
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

            <div>
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
                className="h-12 w-full rounded-2xl border border-[#ededed]/10 bg-[#ededed]/6 px-5 text-base text-[#ededed] caret-[#b5e8cb] backdrop-blur-xl transition-colors outline-none placeholder:text-[#ededed]/40 focus:border-[#ededed]/30 focus:bg-[#ededed]/8 motion-reduce:transition-none"
              />
            </div>

            <div>
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
                className="h-12 w-full rounded-2xl border border-[#ededed]/10 bg-[#ededed]/6 px-5 text-base text-[#ededed] caret-[#b5e8cb] backdrop-blur-xl transition-colors outline-none placeholder:text-[#ededed]/40 focus:border-[#ededed]/30 focus:bg-[#ededed]/8 motion-reduce:transition-none"
              />
            </div>

            {error && (
              <p role="alert" className="text-center text-xs text-red-400">{error}</p>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleSubmit()}
              className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#ededed]/15 px-5 text-base font-semibold text-[#ededed]/55 backdrop-blur-xl transition-colors hover:bg-[#ededed]/20 hover:text-[#ededed]/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b5e8cb] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Continuar"}
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-[#ededed]/40 sm:text-xs">
            Ao continuar, você concorda com os nossos<br />
            <button type="button" className="cursor-pointer rounded-sm font-semibold text-[#ededed]/60 transition-colors hover:text-[#ededed]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5e8cb] motion-reduce:transition-none">Termos de Uso</button>
            {" e "}
            <button type="button" className="cursor-pointer rounded-sm font-semibold text-[#ededed]/60 transition-colors hover:text-[#ededed]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5e8cb] motion-reduce:transition-none">Política de Privacidade</button>.
          </p>
        </section>
      </div>
    </main>
  );
}
