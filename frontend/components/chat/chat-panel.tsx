import { ChatHeader } from "@/components/chat/chat-header";
import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import type { Contact, Message } from "@/types/chat";

type ChatPanelProps = {
  contact: Contact | null;
  contacts: Contact[];
  messages: Message[];
  text: string;
  sending: boolean;
  closing: boolean;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  newMessageId: number | null;

  onTextChange: (text: string) => void;
  onSend: () => void;
  onLoadOlderMessages: () => Promise<void>;
  onReactToMessage: (messageId: number, reaction: string) => Promise<void>;
  onForwardMessage: (message: Message, target: Contact) => void;

  // Envia arquivo + legenda opcional.
  onSendMedia: (
    file: File,
    caption?: string
  ) => Promise<void>;

  onCloseWithBot: () => void;
};

// Agrupa todas as partes visuais da conversa selecionada.
export function ChatPanel({
  contact,
  contacts,
  messages,
  text,
  sending,
  closing,
  hasOlderMessages,
  loadingOlderMessages,
  newMessageId,
  onTextChange,
  onSend,
  onLoadOlderMessages,
  onReactToMessage,
  onForwardMessage,
  onSendMedia,
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
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Papel de parede fornecido pelo usuário via Unsplash. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/teste.jpg')" }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-zinc-950/72" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[58px] z-10 h-12 bg-gradient-to-b from-zinc-950/35 to-transparent"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <ChatHeader contact={contact} />
      </div>

      <MessageList
        contact={contact}
        contacts={contacts}
        messages={messages}
        hasOlderMessages={hasOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        newMessageId={newMessageId}
        onLoadOlderMessages={onLoadOlderMessages}
        onReactToMessage={onReactToMessage}
        onForwardMessage={onForwardMessage}
      />

      <MessageComposer
        text={text}
        sending={sending}
        closing={closing}
        onTextChange={onTextChange}
        onSend={onSend}
        onSendMedia={onSendMedia}
        onCloseWithBot={onCloseWithBot}
      />
    </section>
  );
}
