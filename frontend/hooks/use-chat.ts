"use client";

import { socket } from "@/lib/socket";
import { useEffect, useRef, useState } from "react";

import {
  closeConversationWithBot,
  getContactAvatar,
  getContacts,
  getMessages,
  markMessagesAsRead,
  postMessage,
  reactToMessage as reactToMessageRequest,
  sendMedia as sendMediaRequest,
  setContactArchived as setContactArchivedRequest,
  subscribeToContactPresence,
  updateContactName as updateContactNameRequest,
  updateMessageFlags as updateMessageFlagsRequest,
} from "@/lib/chat-api";

import type {
  Contact,
  Message,
} from "@/types/chat";


// =========================================================
// HOOK PRINCIPAL DO CHAT
// =========================================================

// Concentra o estado e as ações da conversa
// fora dos componentes visuais.
export function useChat() {
  const [contacts, setContacts] =
    useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const avatarRequestsRef = useRef<Set<number>>(new Set());

  const [selectedContact, setSelectedContact] =
    useState<Contact | null>(null);
  const selectedContactIdRef = useRef<number | null>(null);
  const selectedContactId = selectedContact?.id;

  const [messages, setMessages] =
    useState<Message[]>([]);
  const forwardedMessagesRef = useRef<Map<number, Message[]>>(new Map());
  const nextOptimisticIdRef = useRef(-1);

  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const loadingOlderRef = useRef(false);
  const [newMessageId, setNewMessageId] = useState<number | null>(null);
  const [typingContactIds, setTypingContactIds] = useState<Set<number>>(() => new Set());
  const typingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const [text, setText] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [closing, setClosing] =
    useState(false);


  // =========================================================
  // NOVAS MENSAGENS VIA WEBSOCKET
  // =========================================================

  useEffect(() => {
    function setContactTyping(contactId: number, isTyping: boolean) {
      const existingTimeout = typingTimeoutsRef.current.get(contactId);
      if (existingTimeout) clearTimeout(existingTimeout);
      typingTimeoutsRef.current.delete(contactId);

      setTypingContactIds((current) => {
        const next = new Set(current);
        if (isTyping) next.add(contactId);
        else next.delete(contactId);
        return next;
      });

      if (isTyping) {
        const timeout = setTimeout(() => {
          typingTimeoutsRef.current.delete(contactId);
          setTypingContactIds((current) => {
            if (!current.has(contactId)) return current;
            const next = new Set(current);
            next.delete(contactId);
            return next;
          });
        }, 6_000);
        typingTimeoutsRef.current.set(contactId, timeout);
      }
    }

    async function handleNewMessage(data: {
      message: Message;
      contact: Contact;
    }) {
      console.log(
        "📩 Nova mensagem recebida pelo WebSocket:",
        data
      );

      // Verifica se a mensagem pertence
      // à conversa que está aberta.
      const isOpenConversation =
        selectedContact?.id ===
        data.contact.id;

      // INCOMING:
      // WhatsApp -> CotrimBot
      //
      // OUTGOING:
      // CotrimBot -> WhatsApp
      const isIncoming =
        data.message.direction ===
        "INCOMING";

      setContactTyping(data.contact.id, false);


      // =====================================================
      // ATUALIZA A CONVERSA ABERTA
      // =====================================================

      if (isOpenConversation) {
        setNewMessageId(data.message.id);
        setMessages(
          (currentMessages) => {
            const optimisticIndex = data.message.clientId
              ? currentMessages.findIndex((message) => message.clientId === data.message.clientId)
              : -1;

            if (optimisticIndex >= 0) {
              return currentMessages.map((message, index) =>
                index === optimisticIndex
                  ? { ...data.message, clientId: message.clientId }
                  : message
              );
            }

            // Verifica se essa mensagem
            // já está aparecendo na tela.
            const alreadyExists =
              currentMessages.some(
                (message) =>
                  message.externalId ===
                  data.message.externalId
              );

            // Evita mensagens duplicadas.
            if (alreadyExists) {
              return currentMessages;
            }

            // Adiciona a nova mensagem
            // no final do chat.
            return [
              ...currentMessages,
              data.message,
            ];
          }
        );

        // Se for uma mensagem recebida e
        // o usuário já está vendo a conversa,
        // marcamos como lida.
        if (isIncoming) {
          await markMessagesAsRead(
            data.contact.id
          );
        }
      }


      // =====================================================
      // ATUALIZA A SIDEBAR DIRETAMENTE NA MEMÓRIA
      // =====================================================

      // Não precisamos fazer GET /contacts aqui.
      // O próprio WebSocket já trouxe
      // o contato e a mensagem.
      setContacts(
        (currentContacts) => {
          // Procura esse contato
          // na sidebar.
          const existingContact =
            currentContacts.find(
              (contact) =>
                contact.id ===
                data.contact.id
            );

          // Cria uma versão atualizada.
          const updatedContact: Contact = {
            ...(existingContact ??
              data.contact),

            name:
              data.contact.name,

            phone:
              data.contact.phone,

            // A nova mensagem passa
            // a ser a última mensagem.
            messages: [
              data.message,
            ],

            // Se a conversa estiver aberta,
            // unread = 0.
            //
            // Se estiver fechada e for INCOMING,
            // aumenta o contador.
            //
            // OUTGOING não aumenta unread.
            unreadCount:
              isOpenConversation
                ? 0
                : isIncoming
                  ? (
                      existingContact
                        ?.unreadCount ??
                      0
                    ) + 1
                  : (
                      existingContact
                        ?.unreadCount ??
                      0
                    ),
          };

          // Remove a versão antiga.
          const otherContacts =
            currentContacts.filter(
              (contact) =>
                contact.id !==
                data.contact.id
            );

          // Coloca o contato atualizado
          // no topo da sidebar.
          return [
            updatedContact,
            ...otherContacts,
          ];
        }
      );
    }

    function handleMessageReaction(data: { messageId: number; reaction: string | null }) {
      setMessages((current) => current.map((message) => message.id === data.messageId ? { ...message, reaction: data.reaction } : message));
    }

    function handleMessageRead(data: { messageId: number; readAt: string }) {
      setMessages((current) => current.map((message) => message.id === data.messageId ? { ...message, readAt: data.readAt } : message));
    }

    function handleMessageDeleted(data: { messageId: number; deletedAt: string }) {
      setMessages((current) => current.map((message) =>
        message.id === data.messageId ? { ...message, deletedAt: data.deletedAt } : message
      ));
    }

    function handleMessageReplyResolved(data: { messageId: number; quotedMessageId: number }) {
      setMessages((current) => current.map((message) =>
        message.id === data.messageId ? { ...message, quotedMessageId: data.quotedMessageId } : message
      ));
    }

    function handleMessageQuoteUpdated(data: Pick<Message, "quotedExternalId" | "quotedMessageId" | "quotedContent" | "quotedSenderName"> & { messageId: number }) {
      setMessages((current) => current.map((message) =>
        message.id === data.messageId
          ? {
              ...message,
              quotedExternalId: data.quotedExternalId,
              quotedMessageId: data.quotedMessageId,
              quotedContent: data.quotedContent,
              quotedSenderName: data.quotedSenderName,
            }
          : message
      ));
    }

    function handleMessageFlagsUpdated(data: { messageId: number; pinned: boolean; favorited: boolean }) {
      setMessages((current) => current.map((message) =>
        message.id === data.messageId
          ? { ...message, pinned: data.pinned, favorited: data.favorited }
          : message
      ));
    }

    function handleContactUpdated(data: Contact) {
      setContacts((current) => current.map((contact) => contact.id === data.id ? { ...contact, ...data } : contact));
      setSelectedContact((current) => current?.id === data.id ? { ...current, ...data } : current);
    }

    function handleContactPresence(data: { contactId: number; isTyping: boolean }) {
      if (!Number.isInteger(data.contactId) || typeof data.isTyping !== "boolean") return;
      setContactTyping(data.contactId, data.isTyping);
    }


    // Começa a ouvir o evento
    // enviado pelo backend.
    socket.on(
      "new_message",
      handleNewMessage
    );
    socket.on("message_reaction", handleMessageReaction);
    socket.on("message_read", handleMessageRead);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("message_reply_resolved", handleMessageReplyResolved);
    socket.on("message_quote_updated", handleMessageQuoteUpdated);
    socket.on("message_flags_updated", handleMessageFlagsUpdated);
    socket.on("contact_updated", handleContactUpdated);
    socket.on("contact_presence", handleContactPresence);


    // Remove o listener quando
    // o effect for recriado/desmontado.
    return () => {
      socket.off(
        "new_message",
        handleNewMessage
      );
      socket.off("message_reaction", handleMessageReaction);
      socket.off("message_read", handleMessageRead);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("message_reply_resolved", handleMessageReplyResolved);
      socket.off("message_quote_updated", handleMessageQuoteUpdated);
      socket.off("message_flags_updated", handleMessageFlagsUpdated);
      socket.off("contact_updated", handleContactUpdated);
      socket.off("contact_presence", handleContactPresence);
    };
  }, [selectedContact]);

  useEffect(() => () => {
    for (const timeout of typingTimeoutsRef.current.values()) clearTimeout(timeout);
    typingTimeoutsRef.current.clear();
  }, []);


  // =========================================================
  // CONEXÃO SOCKET.IO
  // =========================================================

  useEffect(() => {
    function handleConnect() {
      console.log(
        "🟢 Conectado ao WebSocket:",
        socket.id
      );
    }

    function handleDisconnect() {
      console.log(
        "🔴 Desconectado do WebSocket"
      );
    }


    // Registra os eventos antes
    // de abrir a conexão.
    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );


    // Abre a conexão.
    socket.connect();


    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.disconnect();
    };
  }, []);

  // As fotos chegam em segundo plano e nunca bloqueiam a lista de conversas.
  useEffect(() => {
    for (const contact of contacts) {
      if (contact.profilePictureUrl || avatarRequestsRef.current.has(contact.id)) continue;

      avatarRequestsRef.current.add(contact.id);
      void getContactAvatar(contact.id)
        .then((avatar) => {
          if (!avatar.profilePictureUrl) return;
          setContacts((current) => current.map((item) =>
            item.id === contact.id
              ? { ...item, profilePictureUrl: avatar.profilePictureUrl }
              : item
          ));
        })
        .catch(() => {
          // Uma foto ausente não deve atrasar nem interromper o chat.
        });
    }
  }, [contacts]);


  // =========================================================
  // CARREGAMENTO INICIAL DOS CONTATOS
  // =========================================================

  useEffect(() => {
    let active = true;

    async function loadContacts() {
      try {
        setContactsError(null);
        const data =
          await getContacts();

        if (active) {
          setContacts(data);
        }
      } catch (error) {
        if (active) setContactsError(error instanceof Error ? error.message : "Não foi possível carregar as conversas");
        console.error(
          "Erro ao carregar contatos:",
          error
        );
      } finally {
        if (active) setLoadingContacts(false);
      }
    }

    loadContacts();

    return () => {
      active = false;
    };
  }, []);


  // =========================================================
  // ABRIR UMA CONVERSA
  // =========================================================

  // Quando selecionamos um contato:
  //
  // 1. Busca o histórico.
  // 2. Marca mensagens como lidas.
  // 3. Atualiza a sidebar.
  useEffect(() => {
    if (selectedContactId === undefined) {
      return;
    }

    let active = true;

    getMessages(
      selectedContactId
    )
      .then((page) => {
        if (active) {
          const localMessages = forwardedMessagesRef.current.get(selectedContactId) ?? [];
          const persistedExternalIds = new Set(page.messages.map((message) => message.externalId));
          const unpersistedLocalMessages = localMessages.filter(
            (message) => !persistedExternalIds.has(message.externalId)
          );
          forwardedMessagesRef.current.set(selectedContactId, unpersistedLocalMessages);
          setMessages([...page.messages, ...unpersistedLocalMessages]);
          setHasOlderMessages(page.hasMore);
        }

        return markMessagesAsRead(
          selectedContactId
        );
      })

      .then(() => {
        return getContacts();
      })

      .then((data) => {
        if (active) {
          setContacts(data);
        }
      })

      .catch((error) => {
        console.error(
          "Erro ao abrir conversa:",
          error
        );
      });


    return () => {
      active = false;
    };
  }, [selectedContactId]);

  // A Evolution 2.3.7 só encaminha a presença depois que o Baileys assina
  // o contato. Renovamos enquanto a conversa individual estiver aberta para
  // continuar recebendo "composing" mesmo após uma reconexão do WhatsApp.
  useEffect(() => {
    if (!selectedContactId || selectedContact?.isGroup) return;

    let active = true;

    const subscribe = () => {
      if (!active) return;
      void subscribeToContactPresence(selectedContactId).catch((error) => {
        console.warn("Não foi possível assinar a presença do contato:", error);
      });
    };

    subscribe();
    const interval = window.setInterval(subscribe, 30_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedContactId, selectedContact?.isGroup]);

  async function loadOlderMessages() {
    const contact = selectedContact;
    const firstMessageId = messages[0]?.id;
    if (!contact || !firstMessageId || !hasOlderMessages || loadingOlderRef.current) return;

    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const page = await getMessages(contact.id, firstMessageId);
      if (selectedContactIdRef.current !== contact.id) return;
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        return [...page.messages.filter((message) => !existingIds.has(message.id)), ...current];
      });
      setHasOlderMessages(page.hasMore);
    } catch (error) {
      console.error("Erro ao carregar mensagens anteriores:", error);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
    }
  }

  async function ensureMessageLoaded(messageId: number) {
    if (messages.some((message) => message.id === messageId)) return true;
    const contactId = selectedContactIdRef.current;
    if (!contactId || loadingOlderRef.current) return false;

    let loaded = messages;
    let more = hasOlderMessages;
    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    try {
      while (more && loaded.length && !loaded.some((message) => message.id === messageId)) {
        const page = await getMessages(contactId, loaded[0].id);
        if (selectedContactIdRef.current !== contactId) return false;
        const existingIds = new Set(loaded.map((message) => message.id));
        loaded = [...page.messages.filter((message) => !existingIds.has(message.id)), ...loaded];
        more = page.hasMore;
      }
      setMessages(loaded);
      setHasOlderMessages(more);
      return loaded.some((message) => message.id === messageId);
    } catch (error) {
      console.error("Erro ao localizar mensagem respondida:", error);
      return false;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
    }
  }

  async function reactToMessage(messageId: number, reaction: string) {
    const previous = messages.find((message) => message.id === messageId)?.reaction ?? null;
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, reaction: reaction || null } : message));
    try {
      await reactToMessageRequest(messageId, reaction);
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, reaction: previous } : message));
      throw error;
    }
  }

  function selectContact(contact: Contact | null) {
    selectedContactIdRef.current = contact?.id ?? null;
    setMessages([]);
    setHasOlderMessages(false);
    setLoadingOlderMessages(false);
    loadingOlderRef.current = false;
    setNewMessageId(null);
    setSelectedContact(contact);
  }

  async function archiveContact(contact: Contact, archived: boolean) {
    setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, archived } : item));
    try {
      const updated = await setContactArchivedRequest(contact.id, archived);
      setContacts((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      if (selectedContactIdRef.current === contact.id) selectContact(null);
    } catch (error) {
      setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, archived: contact.archived } : item));
      throw error;
    }
  }

  async function renameContact(contactId: number, name: string) {
    const updated = await updateContactNameRequest(contactId, name);
    setContacts((current) => current.map((contact) =>
      contact.id === updated.id ? { ...contact, name: updated.name } : contact
    ));
    setSelectedContact((current) =>
      current?.id === updated.id ? { ...current, name: updated.name } : current
    );
  }


  // =========================================================
  // ENVIAR MENSAGEM DE TEXTO
  // =========================================================

  function sendMessage(options: { private: boolean; replyToMessageId?: number } = { private: false }) {
    const content =
      text.trim();
    const contact = selectedContact;

    if (
      !contact ||
      !content ||
      sending
    ) {
      return;
    }

    const optimisticId = nextOptimisticIdRef.current--;
    const optimisticMessage: Message = {
      id: optimisticId,
      externalId: `sending:${optimisticId}`,
      content,
      direction: "OUTGOING",
      type: "TEXT",
      contactId: contact.id,
      createdAt: new Date().toISOString(),
      readAt: null,
      reaction: null,
      senderName: null,
      senderPhone: null,
      senderProfilePictureUrl: null,
      deliveryStatus: "sent",
      clientId: `sending:${optimisticId}`,
      private: options.private,
      quotedExternalId: options.replyToMessageId ? messages.find((message) => message.id === options.replyToMessageId)?.externalId ?? null : null,
      quotedMessageId: options.replyToMessageId ?? null,
      quotedContent: options.replyToMessageId ? messages.find((message) => message.id === options.replyToMessageId)?.content ?? null : null,
      quotedSenderName: options.replyToMessageId
        ? (() => {
            const quoted = messages.find((message) => message.id === options.replyToMessageId);
            return quoted?.direction === "OUTGOING" ? "Você" : quoted?.senderName ?? contact.name;
          })()
        : null,
    };

    const localMessages = forwardedMessagesRef.current.get(contact.id) ?? [];
    forwardedMessagesRef.current.set(contact.id, [...localMessages, optimisticMessage]);
    setText("");
    setMessages((current) => [...current, optimisticMessage]);
    setNewMessageId(optimisticId);
    setContacts((current) => {
      const existingContact = current.find((item) => item.id === contact.id) ?? contact;
      const updatedContact = { ...existingContact, messages: [optimisticMessage] };
      return [updatedContact, ...current.filter((item) => item.id !== contact.id)];
    });

    void postMessage(contact.id, content, optimisticMessage.clientId, options.private, options.replyToMessageId)
      .then(({ message }) => {
        const confirmedMessage = { ...message, clientId: optimisticMessage.clientId };
        const replaceOptimistic = (items: Message[]) => {
          const withoutOptimistic = items.filter((item) => item.id !== optimisticId);
          return withoutOptimistic.some((item) => item.externalId === confirmedMessage.externalId)
            ? withoutOptimistic
            : [...withoutOptimistic, confirmedMessage];
        };
        const currentLocal = forwardedMessagesRef.current.get(contact.id) ?? [];
        forwardedMessagesRef.current.set(contact.id, replaceOptimistic(currentLocal));
        if (selectedContactIdRef.current === contact.id) {
          setMessages(replaceOptimistic);
          setNewMessageId(confirmedMessage.id);
        }
        setContacts((current) => current.map((item) =>
          item.id === contact.id ? { ...item, messages: [confirmedMessage] } : item
        ));
      })
      .catch((error) => {
        console.error("Erro ao enviar mensagem:", error);
        const markAsFailed = (items: Message[]) => items.map((item) =>
          item.id === optimisticId ? { ...item, deliveryStatus: "failed" as const } : item
        );
        const currentLocal = forwardedMessagesRef.current.get(contact.id) ?? [];
        forwardedMessagesRef.current.set(contact.id, markAsFailed(currentLocal));
        if (selectedContactIdRef.current === contact.id) setMessages(markAsFailed);
        setContacts((current) => current.map((item) =>
          item.id === contact.id
            ? { ...item, messages: item.messages?.map((message) => message.id === optimisticId ? { ...message, deliveryStatus: "failed" as const } : message) }
            : item
        ));
      });
  }

  // Exibe o encaminhamento no destino antes de esperar a API. A mensagem local
  // é reconciliada com o registro definitivo retornado pelo backend.
  function forwardMessage(sourceMessage: Message, target: Contact) {
    const content = sourceMessage.content.trim();
    if (!content) return;

    const optimisticId = nextOptimisticIdRef.current--;
    const optimisticMessage: Message = {
      id: optimisticId,
      externalId: `forwarding:${optimisticId}`,
      content,
      direction: "OUTGOING",
      type: "TEXT",
      contactId: target.id,
      createdAt: new Date().toISOString(),
      readAt: null,
      reaction: null,
      senderName: null,
      senderPhone: null,
      senderProfilePictureUrl: null,
      // A interface assume sucesso imediatamente; a API confirma em segundo
      // plano e somente uma falha altera o estado visível da mensagem.
      deliveryStatus: "sent",
      clientId: `forwarding:${optimisticId}`,
    };

    const localMessages = forwardedMessagesRef.current.get(target.id) ?? [];
    forwardedMessagesRef.current.set(target.id, [...localMessages, optimisticMessage]);

    const targetWasAlreadyOpen = selectedContactIdRef.current === target.id;
    selectedContactIdRef.current = target.id;
    if (!targetWasAlreadyOpen) setSelectedContact(target);
    setMessages((current) => targetWasAlreadyOpen
      ? [...current, optimisticMessage]
      : [...localMessages, optimisticMessage]
    );
    setHasOlderMessages(false);
    setLoadingOlderMessages(false);
    setNewMessageId(optimisticId);
    setText("");
    setContacts((current) => {
      const updatedTarget = { ...target, messages: [optimisticMessage] };
      return [updatedTarget, ...current.filter((contact) => contact.id !== target.id)];
    });

    void postMessage(target.id, content, optimisticMessage.clientId)
      .then(({ message }) => {
        const sentMessage = { ...message, clientId: optimisticMessage.clientId, deliveryStatus: "sent" as const };
        const replaceOptimistic = (items: Message[]) => {
          const withoutOptimistic = items.filter((item) => item.id !== optimisticId);
          return withoutOptimistic.some((item) => item.externalId === sentMessage.externalId)
            ? withoutOptimistic
            : [...withoutOptimistic, sentMessage];
        };

        const currentLocal = forwardedMessagesRef.current.get(target.id) ?? [];
        forwardedMessagesRef.current.set(target.id, replaceOptimistic(currentLocal));
        if (selectedContactIdRef.current === target.id) {
          setMessages(replaceOptimistic);
          setNewMessageId(message.id);
        }
        setContacts((current) => current.map((contact) =>
          contact.id === target.id ? { ...contact, messages: [sentMessage] } : contact
        ));
      })
      .catch((error) => {
        console.error("Erro ao encaminhar mensagem:", error);
        const markAsFailed = (items: Message[]) => items.map((item) =>
          item.id === optimisticId ? { ...item, deliveryStatus: "failed" as const } : item
        );
        const currentLocal = forwardedMessagesRef.current.get(target.id) ?? [];
        forwardedMessagesRef.current.set(target.id, markAsFailed(currentLocal));
        if (selectedContactIdRef.current === target.id) setMessages(markAsFailed);
        setContacts((current) => current.map((contact) =>
          contact.id === target.id
            ? { ...contact, messages: contact.messages?.map((item) => item.id === optimisticId ? { ...item, deliveryStatus: "failed" as const } : item) }
            : contact
        ));
      });
  }


  // =========================================================
  // ENVIAR MÍDIA
  // =========================================================

  // Recebe o File escolhido no MessageComposer.
  //
  // Exemplos:
  //
  // laudo.pdf
  // foto.png
  // video.mp4
  // audio.ogg
  //
  // O useChat sabe qual contato está aberto,
  // então consegue descobrir para quem enviar.
  async function sendMediaMessage(
    files: File[],
    caption?: string,
    replyToMessageId?: number,
  ) {
    if (
      !selectedContact ||
      !files.length ||
      sending
    ) {
      return;
    }

    try {
      setSending(true);

      // Envia:
      //
      // contactId
      // +
      // arquivo
      // +
      // legenda opcional
      //
      // para o chat-api.
      for (const [index, file] of files.entries()) {
        await sendMediaRequest(
          selectedContact.id,
          file,
          index === 0 ? caption : undefined,
          index === 0 ? replyToMessageId : undefined,
        );
      }

      // Não adicionamos a mensagem
      // manualmente no estado.
      //
      // O backend salva no Prisma
      // e emite "new_message".
      //
      // O Socket.IO atualiza
      // o frontend automaticamente.

    } catch (error) {
      console.error(
        "Erro ao enviar mídia:",
        error
      );

      // Repassa o erro para o
      // MessageComposer conseguir tratar.
      throw error;

    } finally {
      setSending(false);
    }
  }

  async function updateMessageFlags(messageId: number, flags: { pinned?: boolean; favorited?: boolean }) {
    const previous = messages.find((message) => message.id === messageId);
    setMessages((current) => current.map((message) =>
      message.id === messageId ? { ...message, ...flags } : message
    ));
    try {
      await updateMessageFlagsRequest(messageId, flags);
    } catch (error) {
      if (previous) {
        setMessages((current) => current.map((message) =>
          message.id === messageId ? previous : message
        ));
      }
      throw error;
    }
  }


  // =========================================================
  // ENCERRAR CHAMADO COM O BOT
  // =========================================================

  async function closeWithBot() {
    if (
      !selectedContact ||
      closing
    ) {
      return;
    }

    try {
      setClosing(true);

      await closeConversationWithBot(
        selectedContact.id
      );

    } catch (error) {
      console.error(
        "Erro ao encerrar chamado com o bot:",
        error
      );

    } finally {
      setClosing(false);
    }
  }


  // =========================================================
  // DADOS DISPONIBILIZADOS PARA OS COMPONENTES
  // =========================================================

  return {
    contacts,
    loadingContacts,
    contactsError,
    selectedContact,
    messages,
    hasOlderMessages,
    loadingOlderMessages,
    newMessageId,
    isTyping: selectedContactId !== undefined && typingContactIds.has(selectedContactId),

    text,

    sending,
    closing,

    setText,

    selectContact,
    archiveContact,
    renameContact,

    // Envio de texto
    sendMessage,
    forwardMessage,

    loadOlderMessages,
    ensureMessageLoaded,
    reactToMessage,

    // Envio de arquivo
    sendMediaMessage,
    updateMessageFlags,

    // Encerramento
    closeWithBot,
  };
}
