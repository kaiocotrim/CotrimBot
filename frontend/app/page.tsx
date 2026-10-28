"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ContactSidebar, type ContactSidebarHandle } from "@/components/chat/contact-sidebar";
import { NotificationsPopover } from "@/components/chat/notifications-popover";
import { useChat } from "@/hooks/use-chat";
import { useMobileSwipeBack } from "@/hooks/use-mobile-swipe-back";
import { useMobileVisualViewport } from "@/hooks/use-mobile-visual-viewport";
import { useNotifications } from "@/hooks/use-notifications";
import { useSession } from "@/lib/auth-client";
import type { Contact } from "@/types/chat";

// A página apenas conecta o estado da conversa aos componentes visuais.
export default function Home() {
  const chatRootRef = useMobileVisualViewport();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const chat = useChat();
  const assignedUnreadCount = session?.user.id
    ? chat.contacts.reduce((total, contact) => contact.assignedUserIds?.includes(session.user.id)
      ? total + contact.unreadCount
      : total, 0)
    : 0;
  useEffect(() => {
    const originalTitle = document.title;
    document.title = assignedUnreadCount > 0 ? `(${assignedUnreadCount}) ${originalTitle}` : originalTitle;
    return () => { document.title = originalTitle; };
  }, [assignedUnreadCount]);
  // No mobile/tablet a lista de conversas é a tela inicial; ao selecionar um
  // contato, o chat passa a ocupar a tela inteira.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const newContactFormRef = useRef<ContactSidebarHandle>(null);
  // Impede que o mobile caia na tela vazia do chat: sem contato selecionado,
  // a lista permanece aberta mesmo durante hidratação ou restauração de estado.
  const mobileConversationListOpen = sidebarOpen || !chat.selectedContact;
  const backPendingRef = useRef(false);
  const backToList = useCallback(() => {
    if (backPendingRef.current) return;
    if (window.matchMedia("(max-width: 1023px)").matches && window.history.state?.cotrimbotContactId) {
      backPendingRef.current = true;
      window.history.back();
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setSidebarOpen(true);
  }, []);
  const { setPanel, x, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useMobileSwipeBack(!mobileConversationListOpen, backToList);
  const selectedContactId = chat.selectedContact?.id;
  const selectChatContact = chat.selectContact;

  const selectContact = useCallback((contact: Contact) => {
    if (backPendingRef.current) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const state = { ...window.history.state, cotrimbotContactId: contact.id };
      if (window.history.state?.cotrimbotContactId) window.history.replaceState(state, "");
      else window.history.pushState(state, "");
    }
    if (selectedContactId !== contact.id) selectChatContact(contact);
    setSidebarOpen(false);
  }, [selectedContactId, selectChatContact]);

  const historyRestoredRef = useRef(false);
  const restoreConversation = useEffectEvent((state: { cotrimbotContactId?: number } | null) => {
    backPendingRef.current = false;
    if (window.location.pathname !== "/" || !window.matchMedia("(max-width: 1023px)").matches) return;
    const contact = chat.contacts.find((item) => item.id === state?.cotrimbotContactId);
    if (contact) {
      if (selectedContactId !== contact.id) selectChatContact(contact);
      setSidebarOpen(false);
    } else {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setSidebarOpen(true);
    }
  });
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => restoreConversation(event.state);
    // Restaura o estado local antes de o App Router processar a mesma travessia.
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, []);
  useEffect(() => {
    if (!historyRestoredRef.current && chat.contacts.length) {
      historyRestoredRef.current = true;
      if (window.history.state?.cotrimbotContactId) queueMicrotask(() => restoreConversation(window.history.state));
    }
  }, [chat.contacts]);

  function openContactById(contactId: number) {
    const contact = chat.contacts.find((item) => item.id === contactId);
    if (contact) selectContact(contact);
  }

  async function openSharedContactForm(name: string, phone: string) {
    newContactFormRef.current?.openNewContact({ name, phone });
    backToList();
  }

  async function messageSharedContact(_name: string, phone: string) {
    selectContact(await chat.startContactConversation(phone));
  }

  function openNotification(notification: import("@/lib/notification-api").AppNotification) {
    if (!notification.readAt) notifications.markRead(notification.id);
    if (notification.internalConversationId) router.push(`/chat-interno/?conversationId=${encodeURIComponent(notification.internalConversationId)}`);
    else if (notification.contactId) openContactById(notification.contactId);
  }

  const notifications = useNotifications({
    selectedContactId: chat.selectedContact?.id,
    onOpenContact: openContactById,
    onOpenInternalConversation: (conversationId) => router.push(`/chat-interno/?conversationId=${encodeURIComponent(conversationId)}`),
  });
  useEffect(() => {
    if (selectedContactId !== undefined) notifications.markContactRead(selectedContactId);
  }, [selectedContactId, notifications.markContactRead]);

  // O app aberto por um clique em notificação push chega com ?contactId=; abre a conversa
  // assim que os contatos carregarem e limpa a URL.
  const handledLaunchParamsRef = useRef(false);
  useEffect(() => {
    if (handledLaunchParamsRef.current || !chat.contacts.length) return;
    handledLaunchParamsRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("contactId") && !params.has("notificationId")) return;
    const contact = chat.contacts.find((item) => item.id === Number(params.get("contactId")));
    if (contact) queueMicrotask(() => selectContact(contact));
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [chat, selectContact]);
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <main ref={chatRootRef} data-chat-root className="flex h-dvh items-center justify-center bg-zinc-950 text-white">
        <p className="text-sm text-zinc-400">Carregando...</p>
      </main>
    );
  }

  return (
    <main ref={chatRootRef} data-chat-root className="flex h-dvh overflow-hidden bg-zinc-950 text-white">
      <ContactSidebar
        newContactFormRef={newContactFormRef}
        userId={session.user.id}
        contacts={chat.contacts}
        drafts={chat.drafts}
        loading={chat.loadingContacts}
        error={chat.contactsError}
        selectedContactId={chat.selectedContact?.id}
        onSelectContact={selectContact}
        mobileOpen={mobileConversationListOpen}
        revealForSwipe
        onMobileOpenChange={(open) => open ? backToList() : chat.selectedContact && selectContact(chat.selectedContact)}
        onLoadSavedContacts={chat.loadSavedContacts}
        onSaveContact={chat.saveContact}
        onArchiveContact={chat.archiveContact}
        onPinContact={chat.pinContact}
        notifications={notifications.notifications}
        notificationUnreadCount={notifications.unreadCount}
        notificationPermission={notifications.permission}
        onRequestNotificationPermission={() => void notifications.requestPermission()}
        onMarkAllNotificationsRead={notifications.markAllRead}
        onClearNotifications={notifications.clearAll}
        onOpenNotification={openNotification}
        headerActions={
          <NotificationsPopover
            notifications={notifications.notifications}
            unreadCount={notifications.unreadCount}
            permission={notifications.permission}
            onRequestPermission={() => void notifications.requestPermission()}
            onMarkAllRead={notifications.markAllRead}
            onClear={notifications.clearAll}
            onOpenNotification={openNotification}
          />
        }
      />

      <motion.div
        ref={setPanel}
        data-swipe-back-panel
        className="flex min-h-0 min-w-0 flex-1 bg-zinc-950 max-lg:absolute max-lg:inset-0 max-lg:z-50 max-lg:backface-hidden"
        style={{ x }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
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
          contactPresence={chat.contactPresence}
          onTextChange={chat.setText}
          onSend={chat.sendMessage}
          onLoadOlderMessages={chat.loadOlderMessages}
          onEnsureMessageLoaded={chat.ensureMessageLoaded}
          onReactToMessage={chat.reactToMessage}
          onUpdateMessageFlags={chat.updateMessageFlags}
          onDeleteMessage={chat.deleteMessage}
          onEditMessage={chat.editMessage}
          onForwardMessage={chat.forwardMessage}
          onSendMedia={chat.sendMediaMessage}
          onSendPoll={chat.sendPoll}
          onCloseWithBot={chat.closeWithBot}
          onSelectContact={selectContact}
          onSaveContact={chat.saveContact}
          onSaveSharedContact={openSharedContactForm}
          onMessageSharedContact={messageSharedContact}
          onRenameContact={chat.renameContact}
          onSetContactAssignment={chat.setContactAssignment}
          onSetContactPriority={chat.setContactPriority}
          onOpenSidebar={backToList}
          sidebarOpen={mobileConversationListOpen}
        />
      </motion.div>
    </main>
  );
}
