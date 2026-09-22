import { EmojiText } from "@/components/chat/emoji-text";

type VideoMessageProps = {
  mediaUrl: string;
  content: string;
};

export function VideoMessage({ mediaUrl, content }: VideoMessageProps) {
  return (
    <div className="space-y-2">
      <video
        controls
        preload="metadata"
        src={mediaUrl}
        className="max-h-[320px] max-w-full rounded-xl"
        aria-label="Vídeo da mensagem"
      >
        Seu navegador não suporta reprodução de vídeo.
      </video>
      {/* Exibe somente a legenda real, omitindo o marcador padrão. */}
      {content !== "[Vídeo]" && (
        <p className="whitespace-pre-wrap"><EmojiText content={content} /></p>
      )}
    </div>
  );
}
