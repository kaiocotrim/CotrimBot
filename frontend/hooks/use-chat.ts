"use client";

import { socket } from "@/lib/socket";
import { useEffect, useState } from "react";

import {
  closeConversationWithBot,
  getContacts,
  getMessages,
  markMessagesAsRead,
  postMessage,
} from "@/lib/chat-api";

import type { Contact, Message } from "@/types/chat";

// Concentra o estado e as ações da conversa
// fora dos componentes visuais.
export function useChat() {
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [selectedContact, setSelectedContact] =
    useState<Contact | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);

  const [text, setText] = useState("");

  const [sending, setSending] = useState(false);

  const [closing, setClosing] = useState(false);

  // =========================================================
  // NOVAS MENSAGENS VIA WEBSOCKET
  // =========================================================

  // Escuta novas mensagens enviadas pelo backend.
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
        selectedContact?.id === data.contact.id;

      const isIncoming =
        data.message.direction === "INCOMING";
      // =====================================================
      // ATUALIZA A CONVERSA ABERTA
      // =====================================================

      if (isOpenConversation) {
        setMessages((currentMessages) => {
          // Verifica se essa mensagem já está
          // sendo exibida na tela.
          const alreadyExists = currentMessages.some(
            (message) =>
              message.externalId ===
              data.message.externalId
          );

          // Evita mensagens duplicadas.
          if (alreadyExists) {
            return currentMessages;
          }

          // Adiciona a nova mensagem no final do chat.
          return [
            ...currentMessages,
            data.message,
          ];
        });

        // Como o usuário já está olhando essa conversa,
        // marcamos as mensagens recebidas como lidas.
        if (isIncoming) {
          await markMessagesAsRead(
            data.contact.id
          );
        }

      }

      // =====================================================
      // ATUALIZA A SIDEBAR DIRETAMENTE NA MEMÓRIA
      // =====================================================

      // Não precisamos fazer GET /contacts aqui,
      // porque o WebSocket já trouxe o contato
      // e a mensagem nova.
      setContacts((currentContacts) => {
        // Procura esse contato na sidebar.
        const existingContact =
          currentContacts.find(
            (contact) =>
              contact.id === data.contact.id
          );

        // Cria a versão atualizada do contato.
        const updatedContact: Contact = {
          ...(existingContact ?? data.contact),

          // Atualiza os dados básicos.
          name: data.contact.name,
          phone: data.contact.phone,

          // A mensagem que acabou de chegar
          // passa a ser a última mensagem.
          messages: [
            data.message,
          ],

          // Se a conversa estiver aberta,
          // não mostramos mensagens não lidas.
          //
          // Se estiver fechada,
          // aumentamos o contador.
          unreadCount: isOpenConversation
            ? 0
            : isIncoming
              ? (existingContact?.unreadCount ?? 0) + 1
              : (existingContact?.unreadCount ?? 0),
        };

        // Remove a versão antiga desse contato.
        const otherContacts =
          currentContacts.filter(
            (contact) =>
              contact.id !== data.contact.id
          );

        // Coloca o contato atualizado no topo.
        return [
          updatedContact,
          ...otherContacts,
        ];
      });
    }

    // Começa a ouvir o evento enviado pelo backend.
    socket.on(
      "new_message",
      handleNewMessage
    );

    // Remove o listener quando necessário.
    return () => {
      socket.off(
        "new_message",
        handleNewMessage
      );
    };
  }, [selectedContact]);

  // =========================================================
  // CONEXÃO SOCKET.IO
  // =========================================================

  // Mantém a conexão do frontend com o backend.
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

    // Primeiro registra os eventos.
    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    // Depois abre a conexão.
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

  // Busca os contatos apenas uma vez
  // quando o CotrimBot abre.
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
  // 2. Marca as mensagens como lidas.
  // 3. Atualiza a sidebar.
  useEffect(() => {
    if (!selectedContact) {
      return;
    }

    let active = true;

    getMessages(
      selectedContact.id
    )
      .then((data) => {
        if (active) {
          setMessages(data);
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

  // =========================================================
  // ENVIAR MENSAGEM
  // =========================================================

  async function sendMessage() {
    const content = text.trim();

    if (
      !selectedContact ||
      !content ||
      sending
    ) {
      return;
    }

    try {
      setSending(true);

      // Envia a mensagem para o backend.
      await postMessage(
        selectedContact.id,
        content
      );

      // O WebSocket será responsável por
      // adicionar a mensagem na conversa
      // e atualizar a sidebar.
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
    text,
    sending,
    closing,

    setText,

    selectContact:
      setSelectedContact,

    sendMessage,
    closeWithBot,
  };
}
