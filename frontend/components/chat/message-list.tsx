import { Avatar } from "@/components/chat/avatar";
import type { Contact, Message } from "@/types/chat";

type MessageListProps = {
  contact: Contact;
  messages: Message[];
};

// Posiciona mensagens recebidas à esquerda e enviadas à direita.
export function MessageList({ contact, messages }: MessageListProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
      {messages.map((message) => {
        const outgoing = message.direction === "OUTGOING";

        return (
          <div
            key={message.id}
            className={`flex items-center gap-2 ${
              outgoing ? "justify-end" : "justify-start"
            }`}
          >
            {!outgoing && <Avatar contact={contact} />}

            <div
              className={`max-w-[70%] rounded-[24px] px-4 py-2 text-white ${
                outgoing ? "bg-green-600" : "bg-zinc-800"
              }`}
            >
              {/* Preserva as quebras de linha enviadas pelo backend. */}
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
