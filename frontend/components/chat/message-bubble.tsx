import type { Message } from "@/types/chat";

type MessageBubbleProps = {
  message: Message;
};

// Endereço do backend do CotrimBot.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3333";

// Decide como cada tipo de mensagem
// será exibido dentro do chat.
export function MessageBubble({
  message,
}: MessageBubbleProps) {
  const outgoing =
    message.direction === "OUTGOING";

  const mediaUrl =
    `${API_URL}/messages/${message.id}/media`;

  return (
    <div
      className={`min-w-0 max-w-[70%] rounded-[24px] px-4 py-2 text-white ${
        outgoing
          ? "bg-green-600"
          : "bg-zinc-800"
      }`}
    >
      {/* ÁUDIO */}
      {message.type === "AUDIO" && (
        <audio
          controls
          preload="none"
          src={mediaUrl}
          className="max-w-full"
          aria-label="Áudio da mensagem"
        >
          Seu navegador não suporta a reprodução de áudio.
        </audio>
      )}

      {/* IMAGEM */}
      {message.type === "IMAGE" && (
        <div className="space-y-2">
          <img
            src={mediaUrl}
            alt={
              message.content !== "[Imagem]"
                ? message.content
                : "Imagem recebida"
            }
            loading="lazy"
            className="max-h-[420px] max-w-full rounded-xl object-contain"
          />

          {/* Mostra a legenda se existir */}
          {message.content !== "[Imagem]" && (
            <p className="whitespace-pre-wrap">
              {message.content}
            </p>
          )}
        </div>
      )}

      {/* TEXTO */}
      {message.type === "TEXT" && (
        <p className="whitespace-pre-wrap">
          {message.content}
        </p>
      )}

      {/* Tipos que ainda não possuem visual próprio */}
      {message.type !== "TEXT" &&
        message.type !== "AUDIO" &&
        message.type !== "IMAGE" && (
          <p className="whitespace-pre-wrap">
            {message.content}
          </p>
        )}
    </div>
  );
}