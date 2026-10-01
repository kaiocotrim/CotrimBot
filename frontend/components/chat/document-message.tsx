type DocumentMessageProps = {
  mediaUrl: string;
  content: string;
};

function withDownloadParameter(mediaUrl: string) {
  return `${mediaUrl}${mediaUrl.includes("?") ? "&" : "?"}download=1`;
}

export function DocumentMessage({ mediaUrl, content }: DocumentMessageProps) {
  const fileName = content !== "[Documento]" ? content : "Documento";

  return (
    <div className="flex min-w-[280px] max-w-[min(420px,72vw)] items-center gap-3 rounded-xl bg-black/20 p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white/85">
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M8 13h8M8 17h6" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={fileName}>
          {fileName}
        </p>
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs text-white/75 underline decoration-white/35 underline-offset-2 transition-colors hover:text-white"
        >
          Abrir documento
        </a>
      </div>
      <a
        href={withDownloadParameter(mediaUrl)}
        download={fileName}
        aria-label={`Baixar ${fileName}`}
        title="Baixar arquivo"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-white/85 shadow-sm transition-[background-color,color,transform] hover:scale-105 hover:bg-white/[0.14] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 active:scale-95 motion-reduce:transition-none"
      >
        <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m-4-4 4 4 4-4M5 20h14" />
        </svg>
      </a>
    </div>
  );
}
