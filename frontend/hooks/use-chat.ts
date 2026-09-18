"use client";

import { socket } from "@/lib/socket";
import { useEffect, useState } from "react";

import {
  closeConversationWithBot,
  getContacts,
  getMessages,
  markMessagesAsRead,
  postMessage,
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

  const [messages, setMessages] =
    useState<Message[]>([]);

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


    // Começa a ouvir o evento
    // enviado pelo backend.
    socket.on(
      "new_message",
      handleNewMessage
    );


    // Remove o listener quando
    // o effect for recriado/desmontado.
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

    text,

    sending,
    closing,

    setText,

    selectContact:
      setSelectedContact,

    // Envio de texto
    sendMessage,

    // Envio de arquivo
    sendMediaMessage,

    // Encerramento
    closeWithBot,
  };
}


