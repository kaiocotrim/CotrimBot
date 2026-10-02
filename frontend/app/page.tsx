"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ContactSidebar } from "@/components/chat/contact-sidebar";
import { useChat } from "@/hooks/use-chat";
import { useSession } from "@/lib/auth-client";

// A página apenas conecta o estado da conversa aos componentes visuais.
export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const chat = useChat();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <main className="flex h-dvh items-center justify-center bg-zinc-950 text-white">
        <p className="text-sm text-zinc-400">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-zinc-950 text-white">
      <ContactSidebar
        contacts={chat.contacts}
        loading={chat.loadingContacts}
        error={chat.contactsError}
        selectedContactId={chat.selectedContact?.id}
        onSelectContact={chat.selectContact}
        onArchiveContact={chat.archiveContact}
      />

      <ChatPanel
        contact={chat.selectedContact}
        contacts={chat.contacts}
        messages={chat.messages}
        text={chat.text}
        sending={chat.sending}
        closing={chat.closing}
        hasOlderMessages={chat.hasOlderMessages}
        loadingOlderMessages={chat.loadingOlderMessages}
        newMessageId={chat.newMessageId}
        onTextChange={chat.setText}
        onSend={chat.sendMessage}
        onLoadOlderMessages={chat.loadOlderMessages}
        onEnsureMessageLoaded={chat.ensureMessageLoaded}
        onReactToMessage={chat.reactToMessage}
        onUpdateMessageFlags={chat.updateMessageFlags}
        onForwardMessage={chat.forwardMessage}
        onSendMedia={chat.sendMediaMessage}
        onCloseWithBot={chat.closeWithBot}
        onRenameContact={chat.renameContact}
      />
    </main>
  );
}

