type DocumentMessageProps = {
  mediaUrl: string;
  content: string;
};

export function DocumentMessage({ mediaUrl, content }: DocumentMessageProps) {
  return (
    <div className="flex min-w-[240px] items-center gap-3 rounded-xl bg-black/20 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
        📄
      </div>
      <div className="min-w-0 flex-1">
        {/* content contém o nome do arquivo ou o marcador padrão. */}
        <p className="truncate text-sm font-medium">
          {content !== "[Documento]" ? content : "Documento"}
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
  );
}
