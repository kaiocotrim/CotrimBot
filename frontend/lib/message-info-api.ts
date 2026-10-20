export type MessageRecipient = {
  recipientId: string;
  phone: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};

export type MessageInfo = { messageId: number; readBy: MessageRecipient[]; deliveredTo: MessageRecipient[] };

export async function getMessageInfo(messageId: number, signal?: AbortSignal): Promise<MessageInfo> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/messages/${messageId}/info`, { credentials: "include", signal });
  if (!response.ok) throw new Error("Não foi possível carregar os dados da mensagem.");
  return response.json();
}
