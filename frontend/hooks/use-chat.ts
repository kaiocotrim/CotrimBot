"use client";

import { useEffect, useState } from "react";
import { getContacts, getMessages, postMessage } from "@/lib/chat-api";
import type { Contact, Message } from "@/types/chat";

const MESSAGE_REFRESH_INTERVAL = 2000;

// Concentra o estado e as ações da conversa fora dos componentes visuais.
export function useChat() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Carrega a lista inicial de contatos e seus avatares.
  useEffect(() => {
    let active = true;

    getContacts()
      .then((data) => {
        if (active) setContacts(data);
      })
      .catch((error) => console.error("Erro ao carregar contatos:", error));

    return () => {
      active = false;
    };
  }, []);

  // Carrega imediatamente a conversa sempre que o contato muda.
  useEffect(() => {
    if (!selectedContact) return;

    let active = true;
    getMessages(selectedContact.id)
      .then((data) => {
        if (active) setMessages(data);
      })
      .catch((error) => console.error("Erro ao carregar mensagens:", error));

    return () => {
      active = false;
    };
  }, [selectedContact]);

  // Mantém a conversa sincronizada com novas mensagens do WhatsApp.
  useEffect(() => {
    if (!selectedContact) return;

    const interval = window.setInterval(() => {
      getMessages(selectedContact.id)
        .then(setMessages)
        .catch((error) => console.error("Erro ao atualizar mensagens:", error));
    }, MESSAGE_REFRESH_INTERVAL);

    return () => window.clearInterval(interval);
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

  return {
    contacts,
    selectedContact,
    messages,
    text,
    sending,
    setText,
    selectContact: setSelectedContact,
    sendMessage,
  };
}
