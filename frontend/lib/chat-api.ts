import type { Contact, ContactAvatar, Message, MessagesPage } from "@/types/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

// Centraliza o tratamento padrão das respostas do backend.
async function parseResponse<T>(response: Response, errorMessage: string) {
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const detail = typeof result?.error === "string" ? result.error : typeof result?.message === "string" ? result.message : errorMessage;
    throw new Error(detail);
  }
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
      if (contact.profilePictureUrl) return contact;
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

export async function getMessages(contactId: number, before?: number): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: "30" });
  if (before) params.set("before", String(before));
  const response = await fetch(`${API_URL}/contacts/${contactId}/messages?${params}`);
  return parseResponse<MessagesPage>(response, "Erro ao buscar mensagens");
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

export async function reactToMessage(messageId: number, reaction: string): Promise<Message> {
  const response = await fetch(`${API_URL}/messages/${messageId}/reaction`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reaction }),
  });
  return parseResponse<Message>(response, "Erro ao reagir à mensagem");
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

export async function setContactArchived(contactId: number, archived: boolean): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/archived`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  return parseResponse<Contact>(response, "Erro ao alterar arquivamento");
}

export async function postMessage(contactId: number, text: string) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  return parseResponse(response, "Erro ao enviar mensagem");
}

export async function rewriteMessage(text: string): Promise<string> {
  const response = await fetch(`${API_URL}/ai/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const result = await parseResponse<{ text: string }>(response, "Erro ao reformular a mensagem");
  return result.text;
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
