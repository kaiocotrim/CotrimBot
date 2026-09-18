import type { Contact, ContactAvatar, Message } from "@/types/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

// Centraliza o tratamento padrão das respostas do backend.
async function parseResponse<T>(response: Response, errorMessage: string) {
  if (!response.ok) throw new Error(errorMessage);
  return (await response.json()) as T;
}

async function getAvatar(contactId: number) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/avatar`);
  return parseResponse<ContactAvatar>(response, "Erro ao buscar avatar");
}

// Busca os contatos e adiciona o avatar quando ele estiver disponível.
export async function getContacts(): Promise<Contact[]> {
  const response = await fetch(`${API_URL}/contacts`);
  const contacts = await parseResponse<Contact[]>(response, "Erro ao buscar contatos");

  return Promise.all(
    contacts.map(async (contact) => {
      try {
        const avatar = await getAvatar(contact.id);
        return { ...contact, profilePictureUrl: avatar.profilePictureUrl };
      } catch {
        // Uma foto ausente não deve impedir a exibição do contato.
        return contact;
      }
    })
  );
}

export async function getMessages(contactId: number): Promise<Message[]> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/messages`);
  return parseResponse<Message[]>(response, "Erro ao buscar mensagens");
}

export async function transcribeMessage(messageId: number) {
  const response = await fetch(
    `${API_URL}/messages/${messageId}/transcribe`,
    { method: "POST" }
  );

  return parseResponse<{ messageId: number; transcription: string }>(
    response,
    "Erro ao transcrever áudio"
  );
}

// Marca como lidas todas as mensagens recebidas do contato.
export async function markMessagesAsRead(contactId: number): Promise<void> {
  const response = await fetch(
    `${API_URL}/contacts/${contactId}/messages/read`,
    { method: "PATCH" }
  );

  if (!response.ok) {
    throw new Error("Erro ao marcar mensagens como lidas");
  }
}

export async function postMessage(contactId: number, text: string) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  return parseResponse(response, "Erro ao enviar mensagem");
}

// Solicita ao backend o encerramento com a pesquisa de satisfação do bot.
export async function closeConversationWithBot(contactId: number) {
  const response = await fetch(
    `${API_URL}/contacts/${contactId}/close-with-bot`,
    { method: "POST" }
  );

  return parseResponse(response, "Erro ao encerrar chamado com o bot");
}


// Envia mídia para o contato, com legenda opcional.
export async function sendMedia(
  contactId: number,
  file: File,
  caption?: string
) {
  const formData = new FormData();

  formData.append("file", file);

  if (caption?.trim()) {
    formData.append(
      "caption",
      caption.trim()
    );
  }

  const response = await fetch(
    `${API_URL}/contacts/${contactId}/send-media`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(
      "Erro ao enviar mídia"
    );
  }

  return response.json();
}