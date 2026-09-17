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
      className={`min-w-0 max-w-[70%] rounded-[24px] px-4 py-2 text-white ${outgoing
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


      {/* VÍDEO */}
      {message.type === "VIDEO" && (
        <div className="space-y-2">
          <video
            controls
            preload="metadata"
            src={mediaUrl}
            className="max-h-[420px] max-w-full rounded-xl"
            aria-label="Vídeo da mensagem"
          >
            Seu navegador não suporta reprodução de vídeo.
          </video>

          {message.content !== "[Vídeo]" && (
            <p className="whitespace-pre-wrap">
              {message.content}
            </p>
          )}
        </div>
      )}


      {/* DOCUMENTO */}
      {message.type === "DOCUMENT" && (
        <div className="flex min-w-[240px] items-center gap-3 rounded-xl bg-black/20 p-3">
          {/* Ícone simples do documento */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
            📄
          </div>

          <div className="min-w-0 flex-1">
            {/* O webhook já salva o nome do arquivo em content */}
            <p className="truncate text-sm font-medium">
              {message.content !== "[Documento]"
                ? message.content
                : "Documento"}
            </p>

            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs underline underline-offset-2"
            >
              Abrir documento
            </a>
          </div>
        </div>
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


