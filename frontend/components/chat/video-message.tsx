"use client";

// Este componente usa estado, eventos de teclado e o DOM para abrir o
// visualizador em tela cheia; por isso precisa ser executado no cliente.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Avatar } from "@/components/chat/avatar";
import { EmojiText } from "@/components/chat/emoji-text";
import type { Contact } from "@/types/chat";

type VideoMessageProps = {
  // Identifica a mensagem atual dentro da galeria da conversa.
  messageId: number;
  // Endpoint que entrega os bytes do vídeo pelo backend.
  mediaUrl: string;
  // Legenda do vídeo ou o marcador padrão "[Vídeo]".
  content: string;
  // Dados exibidos no cabeçalho do visualizador.
  contact: Contact;
  createdAt: string;
  // Imagens e vídeos disponíveis para navegação no visualizador.
  gallery: Array<{ id: number; type: "IMAGE" | "VIDEO"; mediaUrl: string; content: string; createdAt: string }>;
};

// Mantém a data do visualizador consistente com o fuso usado no restante do chat.
const viewerDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

// Estilo compartilhado pelos botões de download e fechamento.
const controlClass = "flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/70";

export function VideoMessage({ messageId, mediaUrl, content, contact, createdAt, gallery }: VideoMessageProps) {
  // Controla a abertura do modal e qual mídia da galeria está selecionada.
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Remove animações para usuários que ativaram redução de movimento no sistema.
  const reduceMotion = useReducedMotion();

  // Os marcadores automáticos não devem ser renderizados como legenda visível.
  const hasCaption = content !== "[Vídeo]";

  // Garante que o vídeo clicado continue disponível mesmo se a galeria estiver vazia.
  const fallbackItem = { id: messageId, type: "VIDEO" as const, mediaUrl, content, createdAt };
  const activeItem = gallery[activeIndex] ?? fallbackItem;
  const activeHasCaption = activeItem.content !== (activeItem.type === "VIDEO" ? "[Vídeo]" : "[Imagem]");

  // Enquanto o modal estiver aberto, bloqueia o scroll da página e habilita
  // Escape e as setas do teclado para fechar ou navegar pela galeria.
  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setViewerOpen(false);
      if (event.key === "ArrowLeft" && gallery.length > 1) setActiveIndex((index) => (index - 1 + gallery.length) % gallery.length);
      if (event.key === "ArrowRight" && gallery.length > 1) setActiveIndex((index) => (index + 1) % gallery.length);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [gallery.length, viewerOpen]);

  // Abre o visualizador já posicionado na mensagem que recebeu o clique.
  function openViewer() {
    const index = gallery.findIndex((item) => item.id === messageId);
    setActiveIndex(index >= 0 ? index : 0);
    setViewerOpen(true);
  }

  return (
    <div>
      {/*
        Estado parado do player: mostra apenas o frame do vídeo e o botão de
        play translúcido. Os controles nativos aparecem somente no modal.
      */}
      <button
        type="button"
        onClick={openViewer}
        aria-label="Reproduzir vídeo"
        className="group/video relative flex max-h-[420px] w-full max-w-[min(380px,62vw)] items-center justify-center overflow-hidden rounded-[20px] bg-transparent p-0 shadow-[0_2px_12px_rgba(0,0,0,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
      >
        {/* Um pequeno deslocamento ajuda o navegador a gerar o frame inicial. */}
        <video
          preload="metadata"
          src={`${mediaUrl}#t=0.1`}
          muted
          playsInline
          className="pointer-events-none block max-h-[420px] w-full object-cover"
          aria-label="Vídeo da mensagem"
        />
        <span className="absolute top-1/2 left-1/2 flex size-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(30,30,30,0.45)] text-white shadow-[0_3px_12px_rgba(0,0,0,0.18)] backdrop-blur-[14px] transition-transform duration-200 ease-out group-hover/video:scale-[1.04] group-active/video:scale-[0.98] motion-reduce:transition-none">
          <svg className="ml-0.5 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>
        </span>
      </button>

      {/* Exibe somente legendas reais, nunca o marcador interno "[Vídeo]". */}
      {hasCaption && <p className="px-2 pb-0.5 pt-2 whitespace-pre-wrap"><EmojiText content={content} /></p>}

      {/*
        O portal coloca o visualizador diretamente no body para que ele não
        seja limitado pelo overflow ou empilhamento da bolha da mensagem.
      */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {viewerOpen && (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Vídeo enviado por ${contact.name}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="fixed inset-0 z-[2147483646] flex flex-col bg-[#111312]/98 text-white"
            >
              <header className="flex h-16 shrink-0 items-center gap-3 px-5">
                {/* Identificação da conversa e ações principais do visualizador. */}
                <Avatar contact={contact} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold gap-2">{contact.name}</p>
                  <p className="text-[11px] text-zinc-400">{viewerDateFormatter.format(new Date(activeItem.createdAt))}</p>
                </div>
                <div className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] p-1 shadow-lg backdrop-blur-xl">
                  <a href={activeItem.mediaUrl} download aria-label="Baixar mídia" className={controlClass}>
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 20h14" /></svg>
                  </a>
                  <button type="button" onClick={() => setViewerOpen(false)} aria-label="Fechar visualizador" className={controlClass}>
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg>
                  </button>
                </div>
              </header>
              {/* Clicar fora da mídia fecha o visualizador. */}
              <div onClick={() => setViewerOpen(false)} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-16 py-4">
                <motion.div key={activeItem.id} onClick={(event) => event.stopPropagation()} initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }} className="flex h-full w-full items-center justify-center">
                  {activeItem.type === "VIDEO" ? (
                    // No modo aberto, o vídeo inicia automaticamente e pode usar controles nativos.
                    <video src={activeItem.mediaUrl} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg bg-black shadow-2xl">Seu navegador não suporta reprodução de vídeo.</video>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeItem.mediaUrl} alt={activeHasCaption ? activeItem.content : "Imagem recebida"} className="max-h-full max-w-full object-contain shadow-2xl" />
                  )}
                </motion.div>
                {/* As setas aparecem apenas quando existe outra mídia para navegar. */}
                {gallery.length > 1 && <>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setActiveIndex((activeIndex - 1 + gallery.length) % gallery.length); }} aria-label="Mídia anterior" className="absolute left-5 flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white hover:bg-white/10"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg></button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setActiveIndex((activeIndex + 1) % gallery.length); }} aria-label="Próxima mídia" className="absolute right-5 flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white hover:bg-white/10"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>
                </>}
              </div>
              {/* Legenda da mídia atualmente selecionada. */}
              {activeHasCaption && <p className="shrink-0 px-6 py-2 text-center text-xs text-zinc-300"><EmojiText content={activeItem.content} /></p>}
              {/* Faixa de miniaturas para navegação direta entre imagens e vídeos. */}
              {gallery.length > 1 && <div className="flex h-20 shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-white/10 px-4 py-2">
                {gallery.map((item, index) => <button key={item.id} type="button" onClick={() => setActiveIndex(index)} aria-label={`Abrir mídia ${index + 1}`} aria-current={index === activeIndex} className={`relative h-14 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-black/30 p-0.5 ${index === activeIndex ? "border-emerald-400" : "border-transparent hover:border-white/30"}`}>
                  {item.type === "VIDEO" ? <><video src={`${item.mediaUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full rounded-[3px] object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-black/15"><span className="flex size-6 items-center justify-center rounded-full bg-black/65"><svg className="ml-px size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg></span></span></> : <img src={item.mediaUrl} alt="" loading="lazy" className="h-full w-full rounded-[3px] object-cover" />}
                </button>)}
              </div>}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
