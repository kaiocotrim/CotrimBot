import { Avatar } from "@/components/chat/avatar";
import { CompactScrollArea } from "@/components/ui/compact-scroll-area";
import Image from "next/image";
import type { Contact } from "@/types/chat";

type ContactSidebarProps = {
  contacts: Contact[];
  selectedContactId?: number;
  onSelectContact: (contact: Contact) => void;
};

// Renderiza a navegação lateral entre as conversas.
export function ContactSidebar({
  contacts,
  selectedContactId,
  onSelectContact,
}: ContactSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 w-80 flex-col">
      <div className="p-5">
        <h1>
          <Image
            src="/favicon.ico"
            alt="CotrimBot"
            width={40}
            height={40}
            unoptimized
            className="mb-2 size-10 object-contain"
          />
        </h1>

        <p className="text-sm text-zinc-400">
          Conversas
        </p>
      </div>

      <CompactScrollArea className="flex-1" label="Lista de conversas">
        {contacts.map((contact) => {
          // O backend retorna somente a mensagem mais recente.
          const lastMessage = contact.messages?.[0];

          return (
            <button
              key={contact.id}
              onClick={() => onSelectContact(contact)}
              className={`w-full p-4 text-left transition hover:bg-zinc-900 ${
                selectedContactId === contact.id
                  ? "bg-zinc-900"
                  : ""
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Foto do contato */}
                <Avatar contact={contact} />

                {/* Nome e última mensagem */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-medium">
                      {contact.name}
                    </p>

                    {/* Horário */}
                    {lastMessage && (
                      <span className="shrink-0 text-xs text-zinc-500">
                        {new Date(
                          lastMessage.createdAt
                        ).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-3">
                    {/* Última mensagem */}
                    <p className="truncate text-sm text-zinc-500">
                      {lastMessage
                        ? `${
                            lastMessage.direction === "OUTGOING"
                              ? "Você: "
                              : ""
                          }${lastMessage.content}`
                        : "Nenhuma mensagem"}
                    </p>

                    {/* Quantidade de mensagens não lidas */}
                    {contact.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-semibold text-black">
                        {contact.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </CompactScrollArea>
    </aside>
  );
}
