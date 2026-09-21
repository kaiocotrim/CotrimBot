import type { Contact } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";

// Identifica o contato da conversa aberta.
export function ChatHeader({ contact }: { contact: Contact }) {
  return (
    <header className="pointer-events-auto flex h-[58px] w-full items-center gap-3 border-b border-white/10 bg-zinc-950/55 px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-zinc-900/45">
      <Avatar contact={contact} />
      <div className="min-w-0">
        <h2 className="truncate text-sm leading-5 font-semibold">{contact.name}</h2>
        <p className="text-xs leading-4 text-zinc-400">{contact.phone}</p>
      </div>
    </header>
  );
}
