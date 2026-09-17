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

// Mantém o estilo do balão e delega o conteúdo ao componente de cada tipo.
export function MessageBubble({ message }: MessageBubbleProps) {
  const outgoing = message.direction === "OUTGOING";
  const mediaUrl = `${API_URL}/messages/${message.id}/media`;

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

  return (
    <div
      className={`min-w-0 max-w-[70%] rounded-[24px] px-4 py-2 text-white ${outgoing ? "bg-green-600" : "bg-zinc-800"
        }`}
    >
      {content}
    </div>
  );
}
