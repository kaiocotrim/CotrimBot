"use client";

type MessageComposerProps = {
  text: string;
  sending: boolean;
  closing: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onCloseWithBot: () => void;
};

// Controla o campo e o botão usados para enviar uma mensagem.
export function MessageComposer({
  text,
  sending,
  closing,
  onTextChange,
  onSend,
  onCloseWithBot,
}: MessageComposerProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-3xl">
        <form
          className="flex items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!sending && text.trim()) onSend();
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-white/10 bg-zinc-900/90 px-5 py-4 shadow-lg shadow-black/20 backdrop-blur-xl transition focus-within:border-white/25 focus-within:ring-2 focus-within:ring-white/5">
            <svg className="size-6 shrink-0 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
            </svg>
            <input
              type="text"
              aria-label="Mensagem"
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
              }}
              placeholder="Digite uma mensagem..."
              className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-500 sm:text-lg"
            />
          </div>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-busy={sending}
            aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
            title="Enviar mensagem"
            className="flex size-[58px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900/90 text-white shadow-lg shadow-black/20 backdrop-blur-xl transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:opacity-40"
          >
            {sending ? (
              <svg className="size-6 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            ) : (
              <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
            )}
          </button>
        </form>
        <div className="mt-2 flex justify-end px-1">
          <button
            type="button"
            onClick={onCloseWithBot}
            disabled={closing}
            aria-busy={closing}
            className="rounded-full px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:opacity-50"
          >
            {closing ? "Encerrando..." : "Encerrar chamado com Bot"}
          </button>
        </div>
      </div>
    </div>
  );
}
