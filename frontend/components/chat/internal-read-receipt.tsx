import { CheckCheck } from "lucide-react";
import { isInternalMessageRead } from "@/lib/internal-message-read";
import type { InternalConversation, InternalMessage } from "@/lib/internal-chat-api";

export function InternalReadReceipt({ message, participants }: {
  message: InternalMessage;
  participants: InternalConversation["participants"];
}) {
  const read = isInternalMessageRead(message, participants);
  return <span
    title={read ? "Visualizada" : "Enviada"}
    aria-label={read ? "Mensagem visualizada" : "Mensagem enviada"}
    className={`transition-colors duration-200 ${read ? message.private ? "text-zinc-800" : "text-white" : message.private ? "text-zinc-500" : "text-white/50"}`}
  ><CheckCheck aria-hidden="true" className="size-3" /></span>;
}
