"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ContactSidebar } from "@/components/chat/contact-sidebar";
import { NotificationsPopover } from "@/components/chat/notifications-popover";
import { useChat } from "@/hooks/use-chat";
import { useNotifications } from "@/hooks/use-notifications";
import { useSession } from "@/lib/auth-client";
import type { Contact } from "@/types/chat";

// A página apenas conecta o estado da conversa aos componentes visuais.
export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const chat = useChat();
  // No mobile/tablet a lista de conversas é a tela inicial; ao selecionar um
  // contato, o chat passa a ocupar a tela inteira.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Impede que o mobile caia na tela vazia do chat: sem contato selecionado,
  // a lista permanece aberta mesmo durante hidratação ou restauração de estado.
  const mobileConversationListOpen = sidebarOpen || !chat.selectedContact;

  function selectContact(contact: Contact) {
    chat.selectContact(contact);
    setSidebarOpen(false);
  }

  function openContactById(contactId: number) {
    const contact = chat.contacts.find((item) => item.id === contactId);
    if (contact) selectContact(contact);
  }

  const notifications = useNotifications({
    selectedContactId: chat.selectedContact?.id,
    onOpenContact: openContactById,
  });

  // O app aberto por um clique em notificação push chega com ?contactId=; abre a conversa
  // assim que os contatos carregarem e limpa a URL.
  const handledLaunchParamsRef = useRef(false);
  useEffect(() => {
    if (handledLaunchParamsRef.current || !chat.contacts.length) return;
    handledLaunchParamsRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("contactId") && !params.has("notificationId")) return;
    const contact = chat.contacts.find((item) => item.id === Number(params.get("contactId")));
    if (contact) selectContact(contact);
    window.history.replaceState(null, "", window.location.pathname);
  }, [chat]);
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
        userId={session.user.id}
        contacts={chat.contacts}
        loading={chat.loadingContacts}
        error={chat.contactsError}
        selectedContactId={chat.selectedContact?.id}
        onSelectContact={selectContact}
        mobileOpen={mobileConversationListOpen}
        onMobileOpenChange={setSidebarOpen}
        onLoadSavedContacts={chat.loadSavedContacts}
        onSaveContact={chat.saveContact}
        headerActions={
          <NotificationsPopover
            notifications={notifications.notifications}
            unreadCount={notifications.unreadCount}
            permission={notifications.permission}
            onRequestPermission={() => void notifications.requestPermission()}
            onMarkAllRead={notifications.markAllRead}
            onClear={notifications.clearAll}
            onOpenNotification={(notification) => {
              if (!notification.readAt) notifications.markRead(notification.id);
              if (notification.contactId) openContactById(notification.contactId);
            }}
          />
        }
      />

      <div className={`flex min-h-0 min-w-0 flex-1 ${mobileConversationListOpen ? "max-lg:invisible" : ""}`}>
        <ChatPanel
          userId={session.user.id}
          currentUser={session.user}
          contact={chat.selectedContact}
          contacts={chat.contacts}
          messages={chat.messages}
          text={chat.text}
          sending={chat.sending}
          closing={chat.closing}
          hasOlderMessages={chat.hasOlderMessages}
          loadingOlderMessages={chat.loadingOlderMessages}
          newMessageId={chat.newMessageId}
          isTyping={chat.isTyping}
          onTextChange={chat.setText}
          onSend={chat.sendMessage}
          onLoadOlderMessages={chat.loadOlderMessages}
          onEnsureMessageLoaded={chat.ensureMessageLoaded}
          onReactToMessage={chat.reactToMessage}
          onUpdateMessageFlags={chat.updateMessageFlags}
          onDeleteMessage={chat.deleteMessage}
          onForwardMessage={chat.forwardMessage}
          onSendMedia={chat.sendMediaMessage}
          onCloseWithBot={chat.closeWithBot}
          onRenameContact={chat.renameContact}
          onSetContactAssignment={chat.setContactAssignment}
          onSetContactPriority={chat.setContactPriority}
          onOpenSidebar={() => setSidebarOpen(true)}
          sidebarOpen={mobileConversationListOpen}
        />
      </div>
    </main>
  );
}
