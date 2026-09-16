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

      // Se a mensagem pertence à conversa aberta,
      // adiciona imediatamente na tela.
      if (selectedContact?.id === data.contact.id) {
        setMessages((currentMessages) => {
          const alreadyExists = currentMessages.some(
            (message) =>
              message.externalId ===
              data.message.externalId
          );

          if (alreadyExists) {
            return currentMessages;
          }

          return [
            ...currentMessages,
            data.message,
          ];
        });

        // Como a conversa já está aberta,
        // marca as mensagens como lidas.
        await markMessagesAsRead(
          data.contact.id
        );
      }

      // Atualiza a sidebar:
      // última mensagem e unreadCount.
      const updatedContacts =
        await getContacts();

      setContacts(updatedContacts);
    }

    socket.on(
      "new_message",
      handleNewMessage
    );

    return () => {
      socket.off(
        "new_message",
        handleNewMessage
      );
    };
  }, [selectedContact]);

  // Mantém a conexão com o backend via Socket.IO.
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

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

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

  // Carrega a lista de contatos
  // apenas quando a página abre.
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

  // Quando seleciona um contato:
  // carrega o histórico e marca como lido.
  useEffect(() => {
    if (!selectedContact) {
      return;
    }

    let active = true;

    getMessages(selectedContact.id)
      .then((data) => {
        if (active) {
          setMessages(data);
        }

        return markMessagesAsRead(
          selectedContact.id
        );
      })
      .then(() => getContacts())
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

  // Envia uma mensagem pelo painel.
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

      await postMessage(
        selectedContact.id,
        content
      );

      setText("");

      // Atualiza a conversa.
      setMessages(
        await getMessages(
          selectedContact.id
        )
      );

      // Atualiza a sidebar.
      setContacts(
        await getContacts()
      );
    } catch (error) {
      console.error(
        "Erro ao enviar mensagem:",
        error
      );
    } finally {
      setSending(false);
    }
  }

  // Envia a pesquisa configurada no bot.
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

      setMessages(
        await getMessages(
          selectedContact.id
        )
      );

      // Também atualiza a sidebar.
      setContacts(
        await getContacts()
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

  return {
    contacts,
    selectedContact,
    messages,
    text,
    sending,
    closing,

    setText,

    selectContact: setSelectedContact,

    sendMessage,
    closeWithBot,
  };
}