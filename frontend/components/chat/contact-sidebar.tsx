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
    <aside className="w-80 border-r border-zinc-800">
      <div className="border-b border-zinc-800 p-5">
        <h1 className="text-xl font-bold">CotrimBot</h1>

        <p className="text-sm text-zinc-400">
          Conversas
        </p>
      </div>

      <div>
        {contacts.map((contact) => {
          // Como o backend retorna somente a mensagem mais recente,
          // ela estará na posição 0 do array.
          const lastMessage = contact.messages?.[0];

          return (
            <button
              key={contact.id}
              onClick={() => onSelectContact(contact)}
              className={`w-full border-b border-zinc-900 p-4 text-left transition hover:bg-zinc-900 ${
                selectedContactId === contact.id
                  ? "bg-zinc-900"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Nome e última mensagem */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {contact.name}
                  </p>

                  <p className="mt-1 truncate text-sm text-zinc-500">
                    {lastMessage
                      ? `${
                          lastMessage.direction === "OUTGOING"
                            ? "Você: "
                            : ""
                        }${lastMessage.content}`
                      : "Nenhuma mensagem"}
                  </p>
                </div>

                {/* Horário da última mensagem */}
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
            </button>
          );
        })}
      </div>
    </aside>
  );
}