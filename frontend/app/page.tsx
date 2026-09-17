"use client";

import { ChatPanel } from "@/components/chat/chat-panel";
import { ContactSidebar } from "@/components/chat/contact-sidebar";
import { useChat } from "@/hooks/use-chat";

// A página apenas conecta o estado da conversa aos componentes visuais.
export default function Home() {
  const chat = useChat();

  return (
    <main className="flex h-dvh overflow-hidden bg-zinc-950 text-white">
      <ContactSidebar 
        contacts={chat.contacts}
        selectedContactId={chat.selectedContact?.id}
        onSelectContact={chat.selectContact}
      />

      <ChatPanel
        contact={chat.selectedContact}
        messages={chat.messages}
        text={chat.text}
        sending={chat.sending}
        closing={chat.closing}
        onTextChange={chat.setText}
        onSend={chat.sendMessage}
        onCloseWithBot={chat.closeWithBot}
      />
    </main>
  );
}
