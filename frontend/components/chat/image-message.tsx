type ImageMessageProps = {
  mediaUrl: string;
  content: string;
};

export function ImageMessage({ mediaUrl, content }: ImageMessageProps) {
  // O marcador padrão não é uma legenda enviada pelo contato.
  const hasCaption = content !== "[Imagem]";

  return (
    <div className="space-y-2">
      <img
        src={mediaUrl}
        alt={hasCaption ? content : "Imagem recebida"}
        loading="lazy"
        className="max-h-[420px] max-w-full rounded-xl object-contain"
      />
      {hasCaption && <p className="whitespace-pre-wrap">{content}</p>}
    </div>
  );
}
