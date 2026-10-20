import type { InternalConversation, InternalMessage } from "@/lib/internal-chat-api";

export function isInternalMessageRead(
  message: Pick<InternalMessage, "senderId" | "createdAt">,
  participants: InternalConversation["participants"],
) {
  const sentAt = new Date(message.createdAt).getTime();
  if (!Number.isFinite(sentAt)) return false;
  const recipients = participants.filter((participant) => participant.user.id !== message.senderId
    && new Date(participant.joinedAt).getTime() <= sentAt);
  return recipients.length > 0 && recipients.every((participant) => participant.lastReadAt
    && new Date(participant.lastReadAt).getTime() >= sentAt);
}
