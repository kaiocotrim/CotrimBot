import { ChatHeader } from "@/components/chat/chat-header";
import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import type { Contact, Message } from "@/types/chat";

type ChatPanelProps = {
  contact: Contact | null;
  messages: Message[];
  text: string;
  sending: boolean;
  closing: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onCloseWithBot: () => void;
};

// Agrupa todas as partes visuais da conversa selecionada.
export function ChatPanel({
  contact,
  messages,
  text,
  sending,
  closing,
  onTextChange,
  onSend,
  onCloseWithBot,
}: ChatPanelProps) {
  if (!contact) {
    return (
      <section className="flex flex-1 items-center justify-center text-zinc-500">
        Selecione um contato para iniciar
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col">
      <ChatHeader contact={contact} />
      <MessageList contact={contact} messages={messages} />
      <MessageComposer
        text={text}
        sending={sending}
        closing={closing}
        onTextChange={onTextChange}
        onSend={onSend}
        onCloseWithBot={onCloseWithBot}
      />
    </section>
  );
}
