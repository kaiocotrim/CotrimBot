import { AudioMessage } from "@/components/chat/audio-message";
import { DocumentMessage } from "@/components/chat/document-message";
import { ImageMessage } from "@/components/chat/image-message";
import { TextMessage } from "@/components/chat/text-message";
import { VideoMessage } from "@/components/chat/video-message";
import type { Message } from "@/types/chat";

type MessageBubbleProps = {
  message: Message;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3333";

const messageTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Sao_Paulo",
});

const messageDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

// Mantém o estilo do balão e delega o conteúdo ao componente de cada tipo.
export function MessageBubble({ message }: MessageBubbleProps) {
  const outgoing = message.direction === "OUTGOING";
  const isAudio = message.type === "AUDIO";
  const mediaUrl = `${API_URL}/messages/${message.id}/media`;
  const createdAt = new Date(message.createdAt);
  const hasValidDate = !Number.isNaN(createdAt.getTime());
  const inlineTime = message.type === "TEXT" && !/[\r\n]/.test(message.content);

  // Cada caso seleciona um único componente, sem duplicar o conteúdo da mídia.
  const content = (() => {
    switch (message.type) {
      case "TEXT":
        return <TextMessage content={message.content} />;
      case "AUDIO":
        return <AudioMessage
          mediaUrl={mediaUrl}
          messageId={message.id}
        />
      case "IMAGE":
        return <ImageMessage mediaUrl={mediaUrl} content={message.content} />;
      case "VIDEO":
        return <VideoMessage mediaUrl={mediaUrl} content={message.content} />;
      case "DOCUMENT":
        return <DocumentMessage mediaUrl={mediaUrl} content={message.content} />;
      default:
        return <TextMessage content={message.content} />;
    }
  })();

  const timestamp = hasValidDate ? (
    <time
      dateTime={message.createdAt}
      title={messageDateFormatter.format(createdAt)}
      className="shrink-0 select-none text-[9px] leading-none tabular-nums text-white/55"
    >
      {messageTimeFormatter.format(createdAt)}
    </time>
  ) : null;

  return (
    <div
      className={`min-w-0 max-w-[70%] text-white [overflow-wrap:anywhere] ${
        isAudio
          ? "relative w-[min(440px,70vw)] overflow-visible rounded-[24px] border border-white/15 bg-gradient-to-br from-white/[0.09] via-zinc-900/95 to-zinc-950/95 px-4 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14),0_10px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl"
          : `rounded-[24px] px-4 py-2 ${outgoing ? "bg-green-600" : "bg-zinc-800"}`
      }`}
    >
      {inlineTime ? (
        <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0">{content}</div>
          {timestamp}
        </div>
      ) : (
        content
      )}
      {!inlineTime && timestamp && (
        <div className={`flex justify-end ${isAudio ? "mt-2" : "mt-1"}`}>
          {timestamp}
        </div>
      )}
    </div>
  );
}
