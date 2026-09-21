"use client";

import { socket } from "@/lib/socket";
import { useEffect, useRef, useState } from "react";

import {
  closeConversationWithBot,
  getContacts,
  getMessages,
  markMessagesAsRead,
  postMessage,
  reactToMessage as reactToMessageRequest,
  sendMedia as sendMediaRequest,
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

  const [selectedContact, setSelectedContact] =
    useState<Contact | null>(null);
  const selectedContactIdRef = useRef<number | null>(null);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const loadingOlderRef = useRef(false);
  const [newMessageId, setNewMessageId] = useState<number | null>(null);

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


      // =====================================================
      // ATUALIZA A CONVERSA ABERTA
      // =====================================================

      if (isOpenConversation) {
        setNewMessageId(data.message.id);
        setMessages(
          (currentMessages) => {
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


    // Começa a ouvir o evento
    // enviado pelo backend.
    socket.on(
      "new_message",
      handleNewMessage
    );
    socket.on("message_reaction", handleMessageReaction);
    socket.on("message_read", handleMessageRead);


    // Remove o listener quando
    // o effect for recriado/desmontado.
    return () => {
      socket.off(
        "new_message",
        handleNewMessage
      );
      socket.off("message_reaction", handleMessageReaction);
      socket.off("message_read", handleMessageRead);
    };
  }, [selectedContact]);


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


  // =========================================================
  // CARREGAMENTO INICIAL DOS CONTATOS
  // =========================================================

  useEffect(() => {
    let active = true;

    async function loadContacts() {
      try {
        const data =
          await getContacts();

        if (active) {
          setContacts(data);
        }
      } catch (error) {
        console.error(
          "Erro ao carregar contatos:",
          error
        );
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
    if (!selectedContact) {
      return;
    }

    let active = true;

    getMessages(
      selectedContact.id
    )
      .then((page) => {
        if (active) {
          setMessages(page.messages);
          setHasOlderMessages(page.hasMore);
        }

        return markMessagesAsRead(
          selectedContact.id
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
  }, [selectedContact]);

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


  // =========================================================
  // ENVIAR MENSAGEM DE TEXTO
  // =========================================================

  async function sendMessage() {
    const content =
      text.trim();

    if (
      !selectedContact ||
      !content ||
      sending
    ) {
      return;
    }

    try {
      setSending(true);

      // Envia a mensagem
      // para o backend.
      await postMessage(
        selectedContact.id,
        content
      );

      // O Socket.IO será responsável
      // por adicionar a mensagem
      // ao histórico.
      setText("");

    } catch (error) {
      console.error(
        "Erro ao enviar mensagem:",
        error
      );

    } finally {
      setSending(false);
    }
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
    file: File,
    caption?: string
  ) {
    if (
      !selectedContact ||
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
      await sendMediaRequest(
        selectedContact.id,
        file,
        caption
      );

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
    selectedContact,
    messages,
    hasOlderMessages,
    loadingOlderMessages,
    newMessageId,

    text,

    sending,
    closing,

    setText,

    selectContact,

    // Envio de texto
    sendMessage,

    loadOlderMessages,
    reactToMessage,

    // Envio de arquivo
    sendMediaMessage,

    // Encerramento
    closeWithBot,
  };
}
