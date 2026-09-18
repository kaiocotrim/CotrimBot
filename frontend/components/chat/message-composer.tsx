"use client";

import { motion, useAnimate, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AttachmentMenu, type AttachmentKind } from "@/components/chat/attachment-menu";
import { EmojiSelector } from "@/components/chat/emoji-selector";
import { EmojiText } from "@/components/chat/emoji-text";
import { insertEmojiAtSelection } from "@/lib/emoji-text";

type MessageComposerProps = {
  text: string;
  sending: boolean;
  closing: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onCloseWithBot: () => void;
};

type ComposerIconName = "message" | "plus" | "sticker" | "mic" | "send" | "expand" | "collapse";

// Os controles compartilham tamanho e espessura de traço.
function ComposerIcon({ name }: { name: ComposerIconName }) {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "message" && <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "sticker" && <><path d="M9 3h6a6 6 0 0 1 6 6v5l-7 7H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6ZM14 21v-4a3 3 0 0 1 3-3h4" /><path d="M8 9h.01M15 9h.01M8 13a4 4 0 0 0 5 2" /></>}
      {name === "mic" && <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>}
      {name === "send" && <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>}
      {name === "expand" && <path d="M8 3H3v5m13 13h5v-5M3 3l6 6m12 12-6-6" />}
      {name === "collapse" && <path d="M3 8h5V3m13 13h-5v5M8 8 3 3m13 13 5 5" />}
    </svg>
  );
}

// Oculta a barra lateral, mantendo a rolagem por mouse, toque e teclado.
const textClassName = "resize-none bg-transparent p-0 text-base leading-6 text-white outline-none placeholder:text-zinc-500 [overflow-wrap:anywhere] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const buttonClassName = "flex items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-700/70 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:text-zinc-500 motion-reduce:transition-none";

export function MessageComposer({ text, sending, closing, onTextChange, onSend, onCloseWithBot }: MessageComposerProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [emojisOpen, setEmojisOpen] = useState(false);
  const [sendButtonRef, animateSendButton] = useAnimate<HTMLButtonElement>();
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const selectionRef = useRef({ start: text.length, end: text.length });
  const pendingCaretRef = useRef<number | null>(null);
  const emojiSelectorId = useId();
  const attachmentTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentKindRef = useRef<AttachmentKind>("document");
  const [measurements, setMeasurements] = useState({ compact: 24, stacked: 24 });
  const [availableHeight, setAvailableHeight] = useState(400);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const compactMirrorRef = useRef<HTMLTextAreaElement>(null);
  const stackedMirrorRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previousText = useRef(text);
  const textareaId = useId();
  const reduceMotion = useReducedMotion();
  const showControls = isFocused || text.length > 0 || isFullscreen;
  const isStacked = measurements.compact > 24 || isFullscreen;
  const transition = { duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

  // A camada de desenho acompanha a rolagem do textarea, que continua editável.
  const syncTextScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const layer = textLayerRef.current;
    if (!textarea || !layer) return;
    layer.scrollTop = textarea.scrollTop;
    layer.scrollLeft = textarea.scrollLeft;
  }, []);

  useLayoutEffect(() => {
    syncTextScroll();
  }, [text, syncTextScroll]);

  const closeAttachments = useCallback((restoreFocus = false) => {
    setAttachmentsOpen(false);
    if (restoreFocus) attachmentTriggerRef.current?.focus();
  }, []);

  const closeEmojis = useCallback((restoreFocus = false) => {
    setEmojisOpen(false);
    if (restoreFocus) emojiTriggerRef.current?.focus();
  }, []);

  function selectEmoji(emoji: string) {
    if (sending) return;
    const next = insertEmojiAtSelection(text, emoji, selectionRef.current.start, selectionRef.current.end);
    pendingCaretRef.current = next.caret;
    selectionRef.current = { start: next.caret, end: next.caret };
    onTextChange(next.value);
  }

  // Restaura o cursor depois que o React aplicar o texto; mantém o seletor aberto.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const caret = pendingCaretRef.current;
    if (!textarea || caret === null) return;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    pendingCaretRef.current = null;
  }, [text]);

  function selectAttachment(kind: AttachmentKind) {
    const input = fileInputRef.current;
    if (!input || sending) return;
    const accept: Record<AttachmentKind, string> = {
      document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip",
      video: "video/*",
      image: "image/*",
      audio: "audio/*",
    };
    attachmentKindRef.current = kind;
    input.accept = accept[kind];
    input.value = "";
    closeAttachments(true);
    input.click();
  }

  // Espelhos invisíveis medem a quebra de linhas sem zerar a altura do campo visível.
  // A medição compacta é independente da largura expandida, evitando alternância de layout.
  useLayoutEffect(() => {
    const compact = compactMirrorRef.current;
    const stacked = stackedMirrorRef.current;
    const form = formRef.current;
    if (!compact || !stacked || !form) return;
    const measure = () => {
      setMeasurements({ compact: Math.max(24, compact.scrollHeight), stacked: Math.max(24, stacked.scrollHeight) });
      if (!text && previousText.current) setIsFullscreen(false);
      previousText.current = text;
    };
    const frame = requestAnimationFrame(measure);
    let previousWidth = form.clientWidth;
    const observer = new ResizeObserver(() => {
      if (form.clientWidth !== previousWidth) {
        previousWidth = form.clientWidth;
        measure();
      }
    });
    observer.observe(form);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text, showControls, isFocused]);

  // Atualiza o espaço reservado no histórico durante todos os quadros da animação.
  // A expansão respeita a altura real do painel, inclusive após redimensionamento.
  useEffect(() => {
    const composer = composerRef.current;
    const form = formRef.current;
    const panel = composer?.parentElement;
    if (!composer || !form || !panel) return;
    const observer = new ResizeObserver(() => {
      panel.style.setProperty("--chat-composer-height", `${composer.offsetHeight}px`);
      const chromeHeight = composer.offsetHeight - form.offsetHeight;
      setAvailableHeight(Math.max(48, panel.clientHeight - chromeHeight - 16));
    });
    observer.observe(composer);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      panel.style.removeProperty("--chat-composer-height");
    };
  }, []);

  const naturalHeight = Math.max(112, Math.min(measurements.stacked, 144) + 72);
  const fieldHeight = isFullscreen ? availableHeight : isStacked ? Math.min(naturalHeight, availableHeight) : 48;
  const textHeight = isStacked ? Math.max(24, fieldHeight - 72) : 24;
  const textLayout = { height: textHeight, top: isStacked ? 16 : 11, left: isStacked ? 16 : isFocused ? 92 : 52, width: isStacked ? "calc(100% - 64px)" : `calc(100% - ${isFocused ? 144 : showControls ? 104 : 68}px)` };

  return (
    <div ref={composerRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-2xl">
        <form
          ref={formRef}
          className="relative"
          onFocus={() => setIsFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsFocused(false);
              closeAttachments();
              // O seletor controla o fechamento por clique externo; perder foco
              // ao clicar em uma área vazia dele não deve fechar o painel.
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            closeAttachments();
            closeEmojis();
            if (!sending && text.trim()) {
              // Feedback visual sem atrasar o envio para a API.
              if (!reduceMotion && sendButtonRef.current) {
                void animateSendButton(sendButtonRef.current, { scale: [1, 1.16, 1] }, {
                  duration: 0.4,
                  times: [0, 0.4, 1],
                  ease: "easeInOut",
                });
              }
              onSend();
            }
          }}
        >
          {/* Mesmo texto e fonte do campo, sem interferir na altura que está sendo animada. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden opacity-0">
            <textarea ref={compactMirrorRef} value={text} readOnly tabIndex={-1} rows={1} className={textClassName} style={{ height: 0, width: `calc(100% - ${isFocused ? 202 : showControls ? 162 : 126}px)` }} />
            <textarea ref={stackedMirrorRef} value={text} readOnly tabIndex={-1} rows={1} className={textClassName} style={{ height: 0, width: "calc(100% - 66px)" }} />
          </div>

          <motion.div
            initial={false}
            animate={{ height: fieldHeight, marginRight: isStacked ? 0 : 56, borderTopLeftRadius: emojisOpen && !sending ? 0 : 24, borderTopRightRadius: emojisOpen && !sending ? 0 : 24 }}
            style={emojisOpen && !sending ? { borderTopWidth: 0, boxShadow: "inset 0 -1px 1px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.16)" } : undefined}
            transition={transition}
            className={`relative overflow-hidden rounded-[24px] border bg-gradient-to-br from-white/[0.06] via-white/[0.015] to-transparent shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),inset_0_-1px_1px_rgba(0,0,0,0.12),0_4px_20px_rgba(0,0,0,0.16)] backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-250 motion-reduce:transition-none ${emojisOpen && !sending ? "border-[#2f2f33] bg-zinc-900/95" : isFocused ? "border-white/25 bg-zinc-800/85 ring-2 ring-white/5" : "border-white/10 bg-zinc-950/25"}`}
          >
            {/* O textarea guarda o texto; esta camada mostra os mesmos emojis do seletor. */}
            <motion.div
              ref={textLayerRef}
              aria-hidden="true"
              initial={false}
              animate={textLayout}
              transition={transition}
              onAnimationComplete={syncTextScroll}
              className="pointer-events-none absolute overflow-hidden p-0 text-base leading-6 whitespace-pre-wrap text-white [overflow-wrap:anywhere]"
            >
              <EmojiText content={text ? `${text}\u200b` : ""} preserveMetrics />
            </motion.div>
            <motion.textarea
              ref={textareaRef}
              id={textareaId}
              initial={false}
              animate={textLayout}
              transition={transition}
              onAnimationComplete={syncTextScroll}
              rows={1}
              aria-label="Mensagem"
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              onScroll={syncTextScroll}
              onSelect={(event) => {
                selectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
              }}
              onBlur={(event) => {
                selectionRef.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && isFullscreen) {
                  event.preventDefault();
                  setIsFullscreen(false);
                }
                if (event.key !== "Enter") return;
                if (event.nativeEvent.isComposing) {
                  event.preventDefault();
                  return;
                }
                // Enter envia pelo mesmo formulário; Shift+Enter insere uma nova linha.
                if (!event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Digite uma mensagem..."
              className={`absolute caret-white placeholder:[-webkit-text-fill-color:#71717a] ${textClassName}`}
              style={{ color: "transparent", WebkitTextFillColor: "transparent", overflowY: isStacked && measurements.stacked > textHeight ? "auto" : "hidden" }}
            />

            <motion.span initial={false} animate={{ opacity: showControls ? 0 : 1, scale: showControls ? 0.9 : 1 }} transition={transition} className="pointer-events-none absolute bottom-[13px] left-[14px] text-zinc-300">
              <ComposerIcon name="message" />
            </motion.span>
            <motion.button
              ref={attachmentTriggerRef}
              type="button"
              initial={false}
              animate={{ opacity: showControls ? 1 : 0, scale: showControls ? attachmentsOpen ? 0.96 : 1 : 0.9, rotate: reduceMotion ? 0 : attachmentsOpen ? 45 : 0, y: 0, bottom: isStacked ? 8 : 5, left: isStacked ? 8 : 6 }}
              whileTap={reduceMotion || sending ? undefined : { scale: 0.86, backgroundColor: "rgba(63,63,70,0.8)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)" }}
              transition={{ ...transition, scale: reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 22 } }}
              aria-label="Abrir anexos"
              title="Abrir anexos"
              aria-haspopup="menu"
              aria-expanded={attachmentsOpen}
              aria-hidden={!showControls}
              tabIndex={showControls ? 0 : -1}
              disabled={!showControls || sending}
              onClick={() => {
                closeEmojis();
                setAttachmentsOpen((current) => !current);
              }}
              className={`absolute size-9 ${buttonClassName}`}
              style={{ pointerEvents: showControls ? "auto" : "none", transformOrigin: "center" }}
            >
              <ComposerIcon name="plus" />
            </motion.button>
            {/* Surge ao lado do +, reservando espaço no texto com a mesma transição. */}
            <motion.button
              ref={emojiTriggerRef}
              type="button"
              initial={false}
              animate={{ opacity: isFocused ? 1 : 0, scale: isFocused ? 1 : 0.85, x: isFocused ? 0 : -8, bottom: isStacked ? 8 : 5, left: isStacked ? 48 : 46 }}
              transition={transition}
              aria-label="Abrir emojis"
              title="Abrir emojis"
              aria-haspopup="dialog"
              aria-expanded={emojisOpen}
              aria-controls={emojiSelectorId}
              aria-hidden={!isFocused}
              tabIndex={isFocused ? 0 : -1}
              disabled={!isFocused || sending}
              onClick={() => {
                closeAttachments();
                setEmojisOpen((current) => !current);
              }}
              className={`absolute size-9 ${buttonClassName}`}
              style={{ pointerEvents: isFocused ? "auto" : "none" }}
            >
              <ComposerIcon name="sticker" />
            </motion.button>
            <motion.button
              type="button"
              initial={false}
              animate={{ opacity: showControls ? 1 : 0, scale: showControls ? 1 : 0.9, bottom: isStacked ? 8 : 5, right: isStacked ? 52 : 6 }}
              transition={transition}
              aria-label="Gravar áudio"
              title="Gravar áudio"
              aria-hidden={!showControls}
              tabIndex={showControls ? 0 : -1}
              disabled={!showControls || sending}
              onClick={() => console.log("Gravar áudio")}
              className={`absolute size-9 border border-white/10 bg-zinc-800/90 ${buttonClassName}`}
              style={{ pointerEvents: showControls ? "auto" : "none" }}
            >
              <ComposerIcon name="mic" />
            </motion.button>
            <motion.button
              type="button"
              initial={false}
              animate={{ opacity: isStacked ? 1 : 0, scale: isStacked ? 1 : 0.9 }}
              transition={transition}
              aria-label={isFullscreen ? "Recolher campo de mensagem" : "Expandir campo de mensagem"}
              title={isFullscreen ? "Recolher" : "Expandir"}
              aria-expanded={isFullscreen}
              aria-controls={textareaId}
              aria-hidden={!isStacked}
              tabIndex={isStacked ? 0 : -1}
              disabled={!isStacked}
              onClick={() => {
                setIsFullscreen((current) => !current);
                textareaRef.current?.focus();
              }}
              className={`absolute top-2 right-2 size-8 ${buttonClassName}`}
              style={{ pointerEvents: isStacked ? "auto" : "none" }}
            >
              <ComposerIcon name={isFullscreen ? "collapse" : "expand"} />
            </motion.button>
          </motion.div>

          {/* O mesmo botão desliza para dentro quando o texto ocupar mais linhas. */}
          <motion.button
            ref={sendButtonRef}
            type="submit"
            initial={false}
            animate={{ width: isStacked ? 36 : 48, height: isStacked ? 36 : 48, right: isStacked ? 8 : 0, bottom: isStacked ? 8 : 0 }}
            transition={transition}
            disabled={sending || !text.trim()}
            aria-busy={sending}
            aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
            title="Enviar mensagem"
            className={`absolute flex items-center justify-center overflow-hidden rounded-full border bg-gradient-to-br from-white/[0.12] via-white/[0.03] to-transparent shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),inset_0_-1px_1px_rgba(0,0,0,0.16),0_4px_16px_rgba(0,0,0,0.18)] backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,color,box-shadow] duration-250 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/50 motion-reduce:transition-none ${text.trim() ? "border-emerald-200/20 bg-emerald-600/60 text-white enabled:hover:bg-emerald-500/70 enabled:hover:border-emerald-100/30" : "border-white/10 bg-emerald-950/25 text-white/45"}`}
          >
            {sending ? (
              <svg className="size-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            ) : <ComposerIcon name="send" />}
          </motion.button>
          <AttachmentMenu open={attachmentsOpen && !sending} triggerRef={attachmentTriggerRef} onClose={closeAttachments} onSelect={selectAttachment} closing={closing} onCloseWithBot={onCloseWithBot} stacked={isStacked} />
          <EmojiSelector id={emojiSelectorId} open={emojisOpen && !sending} triggerRef={emojiTriggerRef} onClose={closeEmojis} onSelect={selectEmoji} fieldHeight={fieldHeight} rightInset={isStacked ? 0 : 56} />
          {/* Seleciona o arquivo localmente; a integração de envio de mídia é uma etapa separada. */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) console.log("Anexo selecionado", { tipo: attachmentKindRef.current, nome: file.name, tamanho: file.size });
              textareaRef.current?.focus();
            }}
          />
        </form>
      </div>
    </div>
  );
}
