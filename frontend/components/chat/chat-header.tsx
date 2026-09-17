import type { Contact } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";

// Identifica o contato da conversa aberta.
export function ChatHeader({ contact }: { contact: Contact }) {
  return (
    <header className="cursor-pointer pointer-events-auto flex items-center gap-3 rounded-[24px] bg-zinc-950 px-5 py-4 transition-all duration-300 hover:bg-zinc-900/70 hover:shadow-[0_8px_32px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] hover:backdrop-blur-2xl hover:backdrop-saturate-150 supports-[backdrop-filter]:hover:bg-white/[0.07] motion-reduce:transition-none">
      <Avatar contact={contact} />
      <div className="min-w-0">
        <h2 className="truncate font-semibold">{contact.name}</h2>
        <p className="text-sm text-zinc-400">{contact.phone}</p>
      </div>
    </header>
  );
}
