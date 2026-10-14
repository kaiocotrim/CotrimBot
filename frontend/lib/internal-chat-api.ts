export type InternalUser = { id: string; name: string; email?: string; image?: string | null };
export type InternalMember = { userId: string; displayName: string | null; role: string; user: InternalUser };
export type InternalReaction = { userId: string; emoji: string };
export type InternalMessage = {
  id: number;
  conversationId: string;
  senderId: string;
  content: string;
  type: "TEXT" | "FILE";
  clientId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  sender: InternalUser;
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
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Não foi possível concluir a operação.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function base(organizationId: string) {
  return `/organizations/${encodeURIComponent(organizationId)}/internal-conversations`;
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
  messages(organizationId: string, conversationId: string, before?: number) {
    const query = before ? `?before=${before}` : "";
    return request<{ messages: InternalMessage[]; hasMore: boolean; nextCursor: number | null }>(`${base(organizationId)}/${conversationId}/messages${query}`);
  },
  send(organizationId: string, conversationId: string, input: { content: string; clientId: string; replyToMessageId?: number }) {
    return request<{ message: InternalMessage }>(`${base(organizationId)}/${conversationId}/messages`, { method: "POST", body: JSON.stringify(input) });
  },
  read(organizationId: string, conversationId: string) {
    return request<{ lastReadAt: string }>(`${base(organizationId)}/${conversationId}/read`, { method: "PATCH" });
  },
  react(organizationId: string, conversationId: string, messageId: number, emoji: string) {
    return request<{ reaction: InternalReaction }>(`${base(organizationId)}/${conversationId}/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });
  },
  removeReaction(organizationId: string, conversationId: string, messageId: number) {
    return request<void>(`${base(organizationId)}/${conversationId}/messages/${messageId}/reactions`, { method: "DELETE" });
  },
};
