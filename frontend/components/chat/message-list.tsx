import { Avatar } from "@/components/chat/avatar";
import { MessageBubble } from "@/components/chat/message-bubble";
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

            {/* O balão escolhe entre player de áudio e conteúdo textual. */}
            <MessageBubble message={message} />
          </div>
        );
      })}
    </div>
  );
}
