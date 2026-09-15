"use client";

import { useEffect, useState } from "react";

type Contact = {
  id: number;
  name: string;
  phone: string;
};

type Message = {
  id: number;
  externalId: string;
  content: string;
  direction: "INCOMING" | "OUTGOING";
  contactId: number;
  createdAt: string;
};

const API_URL = "http://localhost:3333";

export default function Home() {
  // Lista de contatos vindos do backend
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Contato atualmente selecionado
  const [selectedContact, setSelectedContact] =
    useState<Contact | null>(null);

  // Mensagens do contato selecionado
  const [messages, setMessages] = useState<Message[]>([]);

  // Texto digitado no campo de mensagem
  const [text, setText] = useState("");

  // Controla o estado do botão durante o envio
  const [sending, setSending] = useState(false);

  // Busca todos os contatos no backend
  async function loadContacts() {
    try {
      const response = await fetch(`${API_URL}/contacts`);

      if (!response.ok) {
        throw new Error("Erro ao buscar contatos");
      }

      const data = await response.json();

      setContacts(data);
    } catch (error) {
      console.error("Erro ao carregar contatos:", error);
    }
  }

  // Busca todas as mensagens de um contato
  async function loadMessages(contactId: number) {
    try {
      const response = await fetch(
        `${API_URL}/contacts/${contactId}/messages`
      );

      if (!response.ok) {
        throw new Error("Erro ao buscar mensagens");
      }

      const data = await response.json();

      setMessages(data);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
    }
  }

  // Envia uma nova mensagem
  async function sendMessage() {
    if (!selectedContact || !text.trim()) {
      return;
    }

    try {
      setSending(true);

      const response = await fetch(
        `${API_URL}/contacts/${selectedContact.id}/send`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            text: text.trim(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao enviar mensagem");
      }

      // Limpa o campo depois do envio
      setText("");

      // Busca novamente as mensagens para mostrar
      // a OUTGOING que acabou de ser salva.
      await loadMessages(selectedContact.id);
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    } finally {
      setSending(false);
    }
  }

  // Carrega os contatos assim que a página abre
  useEffect(() => {
    loadContacts();
  }, []);

  // Quando escolhemos outro contato,
  // carregamos as mensagens dele.
  useEffect(() => {
    if (!selectedContact) {
      return;
    }

    loadMessages(selectedContact.id);
  }, [selectedContact]);

  // Atualiza a conversa a cada 2 segundos.
  // Assim novas mensagens recebidas pelo WhatsApp
  // aparecem automaticamente no frontend.
  useEffect(() => {
    if (!selectedContact) {
      return;
    }

    const interval = setInterval(() => {
      loadMessages(selectedContact.id);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [selectedContact]);

  return (
    <main className="flex h-screen bg-zinc-950 text-white">
      {/* Lista de contatos */}
      <aside className="w-80 border-r border-zinc-800">
        <div className="border-b border-zinc-800 p-5">
          <h1 className="text-xl font-bold">
            CotrimBot
          </h1>

          <p className="text-sm text-zinc-400">
            Conversas
          </p>
        </div>

        <div>
          {contacts.map((contact) => (
            <button
              key={contact.id}
              onClick={() => setSelectedContact(contact)}
              className={`w-full border-b border-zinc-900 p-4 text-left hover:bg-zinc-900 ${
                selectedContact?.id === contact.id
                  ? "bg-zinc-900"
                  : ""
              }`}
            >
              <p className="font-medium">
                {contact.name}
              </p>

              <p className="text-sm text-zinc-500">
                {contact.phone}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Área da conversa */}
      <section className="flex flex-1 flex-col">
        {!selectedContact ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            Selecione um contato para iniciar
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <header className="border-b border-zinc-800 p-4">
              <h2 className="font-semibold">
                {selectedContact.name}
              </h2>

              <p className="text-sm text-zinc-500">
                {selectedContact.phone}
              </p>
            </header>

            {/* Mensagens */}
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              {messages.map((message) => {
                const outgoing =
                  message.direction === "OUTGOING";

                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      outgoing
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-xl px-4 py-2 ${
                        outgoing
                          ? "bg-green-600 text-white"
                          : "bg-zinc-800 text-white"
                      }`}
                    >
                      <p>{message.content}</p>

                      <p className="mt-1 text-xs opacity-60">
                        {outgoing
                          ? "OUTGOING"
                          : "INCOMING"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Campo para enviar mensagem */}
            <div className="flex gap-3 border-t border-zinc-800 p-4">
              <input
                type="text"
                value={text}
                onChange={(event) =>
                  setText(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    sendMessage();
                  }
                }}
                placeholder="Digite uma mensagem..."
                className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 outline-none"
              />

              <button
                onClick={sendMessage}
                disabled={sending}
                className="rounded-lg bg-green-600 px-6 py-3 font-medium disabled:opacity-50"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}