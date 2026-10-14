import type { Contact, ContactAvatar, Message, MessagesPage } from "@/types/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// Centraliza o tratamento padrão das respostas do backend.
async function parseResponse<T>(response: Response, errorMessage: string) {
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    const detail = typeof result?.error === "string" ? result.error : typeof result?.message === "string" ? result.message : errorMessage;
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export async function getContactAvatar(contactId: number) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/avatar`, { credentials: "include" });
  return parseResponse<ContactAvatar>(response, "Erro ao buscar avatar");
}

// Busca os contatos e adiciona o avatar quando ele estiver disponível.
export async function getContacts(): Promise<Contact[]> {
  const response = await fetch(`${API_URL}/contacts`, { credentials: "include" });
  return parseResponse<Contact[]>(response, "Erro ao buscar contatos");
}

export async function saveContact(name: string, phone: string, companyName: string, jobTitle?: string): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone, companyName, jobTitle }),
    credentials: "include",
  });
  return parseResponse<Contact>(response, "Não foi possível salvar o contato");
}

export type ContactAssignee = { id: string; name: string; image: string | null };
export type GroupParticipant = {
  phone: string;
  lid?: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  isAdmin: boolean;
};
export async function getContactAssignees(): Promise<ContactAssignee[]> {
  const response = await fetch(`${API_URL}/contacts/assignees`, { credentials: "include" });
  return parseResponse<ContactAssignee[]>(response, "Não foi possível buscar os usuários");
}

export async function getGroupParticipants(contactId: number): Promise<GroupParticipant[]> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/group-participants`, { credentials: "include" });
  return parseResponse<GroupParticipant[]>(response, "Não foi possível carregar os participantes do grupo");
}

export async function setContactAssignment(contactId: number, assignedUserIds: string[]): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/assignment`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignedUserIds }),
    credentials: "include",
  });
  return parseResponse<Contact>(response, "Não foi possível alterar o responsável pela conversa");
}

export async function setContactPriority(contactId: number, priority: NonNullable<Contact["priority"]>): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/priority`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priority }),
    credentials: "include",
  });
  return parseResponse<Contact>(response, "Não foi possível alterar a prioridade");
}

export async function getMessages(contactId: number, before?: number, limit = 30): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", String(before));
  const response = await fetch(`${API_URL}/contacts/${contactId}/messages?${params}`, { credentials: "include" });
  return parseResponse<MessagesPage>(response, "Erro ao buscar mensagens");
}

export async function getFavoriteMessages(contactId: number): Promise<Message[]> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/messages/favorites`, { credentials: "include" });
  return parseResponse<Message[]>(response, "Erro ao buscar mensagens favoritas");
}

export async function subscribeToContactPresence(contactId: number): Promise<void> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/presence-subscription`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Erro ao acompanhar digitação do contato");
  }
}

export async function transcribeMessage(messageId: number) {
  const response = await fetch(
    `${API_URL}/messages/${messageId}/transcribe`,
    { method: "POST", credentials: "include" }
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
    credentials: "include",
  });
  return parseResponse<Message>(response, "Erro ao reagir à mensagem");
}

export async function updateMessageFlags(
  messageId: number,
  flags: { pinned?: boolean; pinDurationHours?: 24 | 168 | 720; favorited?: boolean },
): Promise<Message> {
  const response = await fetch(`${API_URL}/messages/${messageId}/flags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flags),
    credentials: "include",
  });
  return parseResponse<Message>(response, "Erro ao atualizar mensagem");
}

export async function deleteMessage(messageId: number, scope: "me" | "everyone") {
  const response = await fetch(`${API_URL}/messages/${messageId}?scope=${scope}`, {
    method: "DELETE",
    credentials: "include",
  });
  return parseResponse<{ messageId: number; scope: "me" | "everyone"; deletedAt?: string }>(response, "Erro ao apagar mensagem");
}

// Marca como lidas todas as mensagens recebidas do contato.
export async function markMessagesAsRead(contactId: number): Promise<void> {
  const response = await fetch(
    `${API_URL}/contacts/${contactId}/messages/read`,
    { method: "PATCH", credentials: "include" }
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
    credentials: "include",
  });
  return parseResponse<Contact>(response, "Erro ao alterar arquivamento");
}

export async function setContactPinned(contactId: number, pinned: boolean): Promise<Contact> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/pinned`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
    credentials: "include",
  });
  return parseResponse<Contact>(response, "Erro ao alterar fixação da conversa");
}

export async function updateContactName(contactId: number, name: string, companyName?: string, jobTitle?: string, phone?: string) {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...(companyName !== undefined ? { companyName } : {}), ...(jobTitle !== undefined ? { jobTitle } : {}), ...(phone !== undefined ? { phone } : {}) }),
    credentials: "include",
  });
  return parseResponse<Pick<Contact, "id" | "name" | "companyName" | "jobTitle" | "phone">>(response, "Erro ao editar contato");
}

export async function postMessage(contactId: number, text: string, clientId?: string, isPrivate = false, replyToMessageId?: number, includeSignature = true, mentionedUserIds: string[] = []): Promise<{ message: Message }> {
  const response = await fetch(`${API_URL}/contacts/${contactId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, clientId, private: isPrivate, replyToMessageId, includeSignature, mentionedUserIds }),
    credentials: "include",
  });

  return parseResponse<{ message: Message }>(response, "Erro ao enviar mensagem");
}

export async function rewriteMessage(text: string): Promise<string> {
  const response = await fetch(`${API_URL}/ai/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    credentials: "include",
  });

  const result = await parseResponse<{ text: string }>(response, "Erro ao reformular a mensagem");
  return result.text;
}

// Solicita ao backend o encerramento com a pesquisa de satisfação do bot.
export async function closeConversationWithBot(contactId: number): Promise<{ message: Message; contact: Contact }> {
  const response = await fetch(
    `${API_URL}/contacts/${contactId}/close-with-bot`,
    { method: "POST", credentials: "include" }
  );

  return parseResponse<{ message: Message; contact: Contact }>(response, "Erro ao encerrar chamado com o bot");
}


// Envia mídia para o contato, com legenda opcional.
export async function sendMedia(
  contactId: number,
  file: File,
  caption?: string,
  replyToMessageId?: number,
  includeSignature = true,
) {
  const formData = new FormData();

  formData.append("file", file);

  if (caption?.trim()) {
    formData.append(
      "caption",
      caption.trim()
    );
  }

  if (replyToMessageId) {
    formData.append("replyToMessageId", String(replyToMessageId));
  }

  formData.append("includeSignature", String(includeSignature));

  const response = await fetch(
    `${API_URL}/contacts/${contactId}/send-media`,
    {
      method: "POST",
      body: formData,
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(
      "Erro ao enviar mídia"
    );
  }

  return response.json();
}
