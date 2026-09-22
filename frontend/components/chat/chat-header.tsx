import type { Contact } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";

// Identifica o contato da conversa aberta.
export function ChatHeader({ contact }: { contact: Contact }) {
  return (
    <header className="pointer-events-auto flex h-[64px] w-full items-center gap-3 border-b border-white/10 bg-zinc-950/55 px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-zinc-900/45">
      <button
        type="button"
        aria-label="Voltar"
        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-zinc-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50"
      >
        <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <Avatar contact={contact} className="size-10" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] leading-[18px] font-medium">{contact.name}</h2>
        <p className="truncate text-[12px] leading-tight font-normal text-zinc-400">{contact.phone}</p>
      </div>
      <div className="ml-auto flex h-11 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.035] px-1 text-zinc-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_6px_18px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <button
          type="button"
          aria-label="Chamada de vídeo"
          className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50"
        >
          <svg className="size-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 16.5Z" />
            <path d="m16 10 5-3v10l-5-3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Chamada de voz"
          className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50"
        >
          <svg className="size-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v2.2a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 3.4 2 2 0 0 1 4.11 1.2h2.2a2 2 0 0 1 2 1.72c.12.92.33 1.82.62 2.68a2 2 0 0 1-.45 2.11L7.55 8.64a16 16 0 0 0 7.82 7.82l.93-.93a2 2 0 0 1 2.11-.45c.86.29 1.76.5 2.68.62A2 2 0 0 1 22 16.92Z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
