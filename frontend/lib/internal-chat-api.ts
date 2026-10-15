export type InternalUser = { id: string; name: string; email?: string; image?: string | null };
export type InternalMember = { userId: string; displayName: string | null; role: string; user: InternalUser };
export type InternalReaction = { userId: string; emoji: string };
export type InternalMessage = {
  id: number;
  conversationId: string;
  senderId: string;
  content: string;
  type: "TEXT" | "FILE";
  private?: boolean;
  clientId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  sender: InternalUser;
  media?: { mimeType: string; fileName: string } | null;
  replyTo?: { id: number; content: string; sender: { id: string; name: string } } | null;
  reactions: InternalReaction[];
};
export type InternalConversation = {
  id: string;
  organizationId: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  participants: Array<{ user: InternalUser; role: "MEMBER" | "ADMIN"; joinedAt: string; lastReadAt: string | null }>;
  lastMessage: InternalMessage | null;
  unreadCount?: number;
  pinned?: boolean;
  archived?: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Não foi possível conectar ao backend. Verifique se o servidor está rodando.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? (response.status === 404
      ? "A rota do chat interno não foi encontrada. Reinicie o backend com o código atualizado."
      : `O servidor retornou HTTP ${response.status} ao carregar o chat interno.`));
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new Error("A API do chat interno retornou uma resposta inválida. Confira o endereço da API e reinicie o backend.");
  }
}

function base(organizationId: string) {
  return `/organizations/${encodeURIComponent(organizationId)}/internal-conversations`;
}

export function internalMediaUrl(organizationId: string, conversationId: string, messageId: number) {
  return `${API_URL}${base(organizationId)}/${conversationId}/messages/${messageId}/media`;
}

export const internalChatApi = {
  list(organizationId: string) {
    return request<{ conversations: InternalConversation[] }>(base(organizationId));
  },
  members(organizationId: string) {
    return request<{ members: InternalMember[] }>(`${base(organizationId)}/members`);
  },
  create(organizationId: string, input: { type: "DIRECT" | "GROUP"; participantIds: string[]; name?: string }) {
    return request<{ conversation: InternalConversation }>(base(organizationId), { method: "POST", body: JSON.stringify(input) });
  },
  addParticipants(organizationId: string, conversationId: string, participantIds: string[]) {
    return request<{ conversation: InternalConversation }>(`${base(organizationId)}/${conversationId}/participants`, { method: "POST", body: JSON.stringify({ participantIds }) });
  },
  messages(organizationId: string, conversationId: string, before?: number, limit?: number) {
    const params = new URLSearchParams();
    if (before) params.set("before", String(before));
    if (limit) params.set("limit", String(limit));
    const query = params.size ? `?${params.toString()}` : "";
    return request<{ messages: InternalMessage[]; hasMore: boolean; nextCursor: number | null }>(`${base(organizationId)}/${conversationId}/messages${query}`);
  },
  send(organizationId: string, conversationId: string, input: { content: string; clientId: string; replyToMessageId?: number; private?: boolean; includeSignature?: boolean; mentionedUserIds?: string[] }) {
    return request<{ message: InternalMessage }>(`${base(organizationId)}/${conversationId}/messages`, { method: "POST", body: JSON.stringify(input) });
  },
  async sendMedia(organizationId: string, conversationId: string, file: File, caption: string, replyToMessageId?: number, includeSignature = true) {
    const body = new FormData();
    body.append("file", file);
    if (caption.trim()) body.append("caption", caption.trim());
    if (replyToMessageId) body.append("replyToMessageId", String(replyToMessageId));
    body.append("includeSignature", String(includeSignature));
    let response: Response;
    try {
      response = await fetch(`${API_URL}${base(organizationId)}/${conversationId}/media`, { method: "POST", body, credentials: "include" });
    } catch {
      throw new Error("Não foi possível conectar ao backend para enviar o arquivo.");
    }
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error ?? `Não foi possível enviar o arquivo (HTTP ${response.status}).`);
    }
    return response.json() as Promise<{ message: InternalMessage }>;
  },
  transcribe(organizationId: string, conversationId: string, messageId: number) {
    return request<{ messageId: number; transcription: string }>(`${base(organizationId)}/${conversationId}/messages/${messageId}/transcribe`, { method: "POST" });
  },
  read(organizationId: string, conversationId: string) {
    return request<{ lastReadAt: string }>(`${base(organizationId)}/${conversationId}/read`, { method: "PATCH" });
  },
  preferences(organizationId: string, conversationId: string, input: { pinned?: boolean; archived?: boolean }) {
    return request<{ pinned: boolean; archived: boolean }>(`${base(organizationId)}/${conversationId}/preferences`, { method: "PATCH", body: JSON.stringify(input) });
  },
  deleteMessage(organizationId: string, conversationId: string, messageId: number) {
    return request<{ messageId: number }>(`${base(organizationId)}/${conversationId}/messages/${messageId}`, { method: "DELETE" });
  },
  react(organizationId: string, conversationId: string, messageId: number, emoji: string) {
    return request<{ reaction: InternalReaction }>(`${base(organizationId)}/${conversationId}/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });
  },
  removeReaction(organizationId: string, conversationId: string, messageId: number) {
    return request<void>(`${base(organizationId)}/${conversationId}/messages/${messageId}/reactions`, { method: "DELETE" });
  },
};
