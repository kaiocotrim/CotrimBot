import type { Contact } from "@/types/chat";

// Identifica o contato da conversa aberta.
export function ChatHeader({ contact }: { contact: Contact }) {
  return (
    <header className="border-b border-zinc-800 p-4">
      <h2 className="font-semibold">{contact.name}</h2>
      <p className="text-sm text-zinc-500">{contact.phone}</p>
    </header>
  );
}
