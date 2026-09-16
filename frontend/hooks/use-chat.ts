"use client";

import { useEffect, useState } from "react";
import {
  closeConversationWithBot,
  getContacts,
  getMessages,
  markMessagesAsRead,
  postMessage,
} from "@/lib/chat-api";
import type { Contact, Message } from "@/types/chat";

const MESSAGE_REFRESH_INTERVAL = 2000;
const CONTACT_REFRESH_INTERVAL = 3000;

// Concentra o estado e as ações da conversa fora dos componentes visuais.
export function useChat() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  // Carrega a lista inicial de contatos e seus avatares.
  useEffect(() => {
    let active = true;

    // Função responsável por buscar a lista atualizada de contatos.
    async function loadContacts() {
      try {
        const data = await getContacts();

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

    // Busca imediatamente quando a página abre.
    loadContacts();

    // Depois busca novamente a cada 3 segundos.
    const interval = window.setInterval(() => {
      loadContacts();
    }, CONTACT_REFRESH_INTERVAL);

    // Quando o componente for desmontado,
    // interrompe o polling.
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  // Abre a conversa, marca as mensagens como lidas e atualiza a sidebar.
  useEffect(() => {
    if (!selectedContact) return;

    let active = true;

    getMessages(selectedContact.id)
      .then((data) => {
        if (active) setMessages(data);
        return markMessagesAsRead(selectedContact.id);
      })
      .then(() => getContacts())
      .then((data) => {
        if (active) setContacts(data);
      })
      .catch((error) => console.error("Erro ao abrir conversa:", error));

    return () => {
      active = false;
    };
  }, [selectedContact]);

  // Mantém a conversa sincronizada com novas mensagens do WhatsApp.
  useEffect(() => {
    if (!selectedContact) return;

    const interval = window.setInterval(async () => {
      try {
        // Busca as mensagens mais recentes da conversa aberta.
        const data = await getMessages(selectedContact.id);

        // Atualiza as mensagens exibidas no chat.
        setMessages(data);

        // Verifica se existe pelo menos uma mensagem recebida
        // que ainda não foi marcada como lida.
        const hasUnreadMessages = data.some(
          (message) =>
            message.direction === "INCOMING" &&
            message.readAt === null
        );

        // Se a conversa já está aberta, consideramos
        // essas novas mensagens como lidas.
        if (hasUnreadMessages) {
          await markMessagesAsRead(selectedContact.id);

          // Atualiza a lista de contatos para remover
          // o contador de mensagens não lidas da sidebar.
          const updatedContacts = await getContacts();

          setContacts(updatedContacts);
        }
      } catch (error) {
        console.error(
          "Erro ao atualizar mensagens:",
          error
        );
      }
    }, MESSAGE_REFRESH_INTERVAL);

    return () => {
      window.clearInterval(interval);
    };
  }, [selectedContact]);

  async function sendMessage() {
    const content = text.trim();
    if (!selectedContact || !content || sending) return;

    try {
      setSending(true);
      await postMessage(selectedContact.id, content);
      setText("");
      setMessages(await getMessages(selectedContact.id));
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    } finally {
      setSending(false);
    }
  }

  // Envia a pesquisa configurada no bot e atualiza a conversa na tela.
  async function closeWithBot() {
    if (!selectedContact || closing) return;

    try {
      setClosing(true);
      await closeConversationWithBot(selectedContact.id);
      setMessages(await getMessages(selectedContact.id));
    } catch (error) {
      console.error("Erro ao encerrar chamado com o bot:", error);
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
