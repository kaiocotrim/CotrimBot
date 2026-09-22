"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AttachmentMenu, type AttachmentKind } from "@/components/chat/attachment-menu";
import { EmojiSelector } from "@/components/chat/emoji-selector";
import { EmojiText } from "@/components/chat/emoji-text";
import { insertEmojiAtSelection } from "@/lib/emoji-text";
import { rewriteMessage } from "@/lib/chat-api";


type MessageComposerProps = {
  text: string;
  sending: boolean;
  closing: boolean;

  onTextChange: (text: string) => void;
  onSend: () => void;
  onCloseWithBot: () => void;
  allowCloseWithBot?: boolean;

  onSendMedia: (
    file: File,
    caption?: string
  ) => Promise<void>;
};
type ComposerIconName = "message" | "plus" | "sticker" | "mic" | "send" | "expand" | "collapse" | "sparkles";

const LONG_PASTE_CHARACTER_LIMIT = 1200;
const LONG_PASTE_LINE_LIMIT = 18;

function shouldCollapsePastedText(value: string) {
  return value.length >= LONG_PASTE_CHARACTER_LIMIT || value.split(/\r?\n/).length >= LONG_PASTE_LINE_LIMIT;
}

function longTextPreview(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "Texto colado";
  return normalized.length > 42 ? `${normalized.slice(0, 42).trimEnd()}…` : normalized;
}

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
      {name === "sparkles" && <><path d="m12 3 1.35 3.65L17 8l-3.65 1.35L12 13l-1.35-3.65L7 8l3.65-1.35L12 3Z" /><path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /><path d="m5 14 .65 1.35L7 16l-1.35.65L5 18l-.65-1.35L3 16l1.35-.65L5 14Z" /></>}
    </svg>
  );
}

// Oculta a barra lateral, mantendo a rolagem por mouse, toque e teclado.
const textClassName = "resize-none bg-transparent p-0 text-[13.5px] leading-6 font-normal text-white outline-none placeholder:text-zinc-400 [overflow-wrap:anywhere] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const buttonClassName = "flex items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:text-zinc-500 motion-reduce:transition-none";

export function MessageComposer({
  text,
  sending,
  closing,
  onTextChange,
  onSend,
  onCloseWithBot,
  allowCloseWithBot = true,
  onSendMedia,
}: MessageComposerProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [emojisOpen, setEmojisOpen] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [longTextCollapsed, setLongTextCollapsed] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // =========================================================
  // GRAVAÇÃO DE ÁUDIO
  // =========================================================

  const [isRecording, setIsRecording] =
    useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState([0.2, 0.2, 0.2, 0.2, 0.2]);

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(null);

  const audioChunksRef =
    useRef<Blob[]>([]);

  const microphoneStreamRef =
    useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
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
  const longTextTriggerRef = useRef<HTMLButtonElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const compactMirrorRef = useRef<HTMLTextAreaElement>(null);
  const stackedMirrorRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previousText = useRef(text);
  const textareaId = useId();
  const reduceMotion = useReducedMotion();
  const isLongTextCollapsed = longTextCollapsed && Boolean(text);
  const showControls = isFocused || text.length > 0 || isFullscreen;
  const isStacked = measurements.compact > 24 || isFullscreen || isLongTextCollapsed;
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

  async function handleRewrite() {
    const originalText = text.trim();
    if (!originalText || rewriting || sending) return;

    setRewriting(true);
    setRewriteError(null);
    try {
      const rewritten = await rewriteMessage(originalText);
      onTextChange(rewritten);
      const caret = rewritten.length;
      pendingCaretRef.current = caret;
      selectionRef.current = { start: caret, end: caret };
    } catch (error) {
      console.error("Erro ao reformular mensagem:", error);
      setRewriteError(error instanceof Error ? error.message : "Não foi possível reformular o texto.");
    } finally {
      setRewriting(false);
    }
  }

  async function sendPendingAttachment() {
    if (!pendingFile || sending) return;
    setAttachmentError(null);
    try {
      await onSendMedia(pendingFile, text.trim() || undefined);
      setPendingFile(null);
      onTextChange("");
    } catch (error) {
      console.error("Erro ao enviar anexo:", error);
      setAttachmentError("Não foi possível enviar o arquivo. Tente novamente.");
    }
  }
  async function startRecording() {
    if (sending || isRecording) {
      return;
    }

    try {
      setAttachmentError(null);

      // Pede permissão para usar o microfone.
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      microphoneStreamRef.current =
        stream;

      const AudioContextConstructor = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) {
        const audioContext = new AudioContextConstructor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.72;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
      }
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);

      // Chrome normalmente suporta WebM + Opus.
      const preferredMimeType =
        "audio/webm;codecs=opus";

      const recorder =
        MediaRecorder.isTypeSupported(
          preferredMimeType
        )
          ? new MediaRecorder(stream, {
            mimeType: preferredMimeType,
          })
          : new MediaRecorder(stream);

      mediaRecorderRef.current =
        recorder;

      // Limpa pedaços de uma gravação anterior.
      audioChunksRef.current = [];

      // O navegador vai entregando pequenos
      // pedaços do áudio enquanto grava.
      recorder.ondataavailable = (
        event
      ) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(
            event.data
          );
        }
      };

      // Quando terminarmos a gravação,
      // juntamos os pedaços e criamos um File.
      recorder.onstop = () => {
        const mimeType =
          recorder.mimeType ||
          "audio/webm";

        const audioBlob =
          new Blob(
            audioChunksRef.current,
            {
              type: mimeType,
            }
          );

        if (audioBlob.size > 0) {
          const extension =
            mimeType.includes("ogg")
              ? "ogg"
              : mimeType.includes("mp4")
                ? "m4a"
                : "webm";

          const audioFile =
            new File(
              [audioBlob],
              `audio-${Date.now()}.${extension}`,
              {
                type: mimeType,
              }
            );

          // Reaproveita o mesmo sistema
          // de anexos que você já criou.
          setPendingFile(audioFile);
          setAttachmentError(null);
        }

        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
      };

      recorder.start();

      setIsRecording(true);

      console.log(
        "🎙️ Gravação iniciada"
      );

    } catch (error) {
      console.error(
        "Erro ao acessar o microfone:",
        error
      );

      setAttachmentError(
        "Não foi possível acessar o microfone."
      );
    }
  }


  // =========================================================
  // PARAR GRAVAÇÃO
  // =========================================================

  function stopRecording() {
    const recorder =
      mediaRecorderRef.current;

    if (
      !recorder ||
      recorder.state === "inactive"
    ) {
      return;
    }

    recorder.stop();

    // Libera o microfone do navegador.
    microphoneStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    microphoneStreamRef.current =
      null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    recordingStartedAtRef.current = null;
    setAudioLevels([0.2, 0.2, 0.2, 0.2, 0.2]);

    setIsRecording(false);

    console.log(
      "⏹️ Gravação finalizada"
    );
  }

  useEffect(() => {
    if (!isRecording) return;
    let frame = 0;
    const data = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 0);
    const update = () => {
      const analyser = analyserRef.current;
      if (analyser && data.length) {
        analyser.getByteFrequencyData(data);
        const bands = [0, 2, 5, 9, 14].map((start, index) => {
          const end = Math.min(data.length, start + (index === 0 ? 3 : 4));
          const average = data.slice(start, end).reduce((sum, value) => sum + value, 0) / Math.max(1, end - start);
          return Math.max(0.12, Math.min(1, average / 150));
        });
        setAudioLevels(bands);
      }
      if (recordingStartedAtRef.current) setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isRecording]);

  function formatRecordingTime(seconds: number) {
    return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  }
  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const naturalHeight = isLongTextCollapsed ? 136 : Math.max(112, Math.min(measurements.stacked, 144) + 72);
  const fieldHeight = isFullscreen ? availableHeight : isStacked ? Math.min(naturalHeight, availableHeight) : 44;
  const textHeight = isStacked ? Math.max(24, fieldHeight - 72) : 24;
  const controlBottom = isStacked ? 8 : 6;
  const compactTextInset = isRecording ? (isFocused ? 216 : 180) : isFocused ? 178 : showControls ? 144 : 68;
  const textLayout = { height: textHeight, top: isStacked ? 16 : 10, left: isStacked ? 16 : isFocused ? 88 : 52, width: isStacked ? "calc(100% - 64px)" : `calc(100% - ${compactTextInset}px)` };

  return (
    <div ref={composerRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent px-4 pt-5 pb-[max(2.125rem,env(safe-area-inset-bottom))] sm:px-5">
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
            if (pendingFile) {
              void sendPendingAttachment();
              return;
            }
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
          <AnimatePresence>
            {pendingFile && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={transition}
                className="absolute bottom-full left-0 mb-2 flex max-w-[min(360px,85vw)] items-center gap-3 rounded-2xl border border-white/15 bg-zinc-900/95 px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-zinc-200">
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">{pendingFile.name}</span>
                  <span className={`block text-[11px] ${attachmentError ? "text-red-300" : "text-zinc-400"}`}>{attachmentError ?? formatFileSize(pendingFile.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setPendingFile(null); setAttachmentError(null); }}
                  aria-label="Remover arquivo"
                  title="Remover arquivo"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {attachmentError && <span role="alert" className="sr-only">{attachmentError}</span>}
          {/* Mesmo texto e fonte do campo, sem interferir na altura que está sendo animada. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden opacity-0">
            <textarea ref={compactMirrorRef} value={text} readOnly tabIndex={-1} rows={1} className={textClassName} style={{ height: 0, width: `calc(100% - ${compactTextInset + 58}px)` }} />
            <textarea ref={stackedMirrorRef} value={text} readOnly tabIndex={-1} rows={1} className={textClassName} style={{ height: 0, width: "calc(100% - 66px)" }} />
          </div>

          <motion.div
            initial={false}
            animate={{ height: fieldHeight, marginRight: isStacked ? 0 : 56, borderTopLeftRadius: emojisOpen && !sending ? 0 : 24, borderTopRightRadius: emojisOpen && !sending ? 0 : 24 }}
            style={emojisOpen && !sending ? { borderTopWidth: 0, boxShadow: "inset 0 -1px 1px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.16)" } : undefined}
            transition={transition}
            className={`relative overflow-hidden rounded-[24px] border bg-gradient-to-b from-white/[0.075] via-white/[0.03] to-white/[0.015] shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),inset_0_-1px_1px_rgba(0,0,0,0.22),0_6px_22px_rgba(0,0,0,0.2)] backdrop-blur-2xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-250 motion-reduce:transition-none ${emojisOpen && !sending ? "border-white/15 bg-zinc-900/90" : isFocused ? "border-white/25 bg-zinc-900/65 ring-2 ring-white/[0.06]" : "border-white/12 bg-zinc-950/35"}`}
          >
            <AnimatePresence initial={false}>
              {isLongTextCollapsed && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={transition}
                  className="absolute top-2.5 right-2.5 left-2.5 z-10 flex h-[66px] items-center gap-3 rounded-[18px] border border-white/15 bg-zinc-900/95 px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_5px_18px_rgba(0,0,0,0.2)]"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300 text-zinc-300" aria-hidden="true">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h6l4 4v14H8z" /><path d="M14 3v5h4" /></svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-100">{longTextPreview(text)}</span>
                    <button
                      ref={longTextTriggerRef}
                      type="button"
                      onClick={() => {
                        setLongTextCollapsed(false);
                        setIsFullscreen(true);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-zinc-400 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-200"
                    >
                      Exibir no campo de texto <span aria-hidden="true">›</span>
                    </button>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {/* O textarea guarda o texto; esta camada mostra os mesmos emojis do seletor. */}
            <motion.div
              ref={textLayerRef}
              aria-hidden="true"
              initial={false}
              animate={textLayout}
              transition={transition}
              onAnimationComplete={syncTextScroll}
              className={`pointer-events-none absolute overflow-hidden p-0 text-[13.5px] leading-6 font-normal whitespace-pre-wrap text-white [overflow-wrap:anywhere] ${isLongTextCollapsed ? "invisible" : ""}`}
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
              onChange={(event) => {
                setLongTextCollapsed(false);
                onTextChange(event.target.value);
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                if (!pasted) return;
                const target = event.currentTarget;
                const nextValue = text.slice(0, target.selectionStart) + pasted + text.slice(target.selectionEnd);
                if (!shouldCollapsePastedText(nextValue)) return;
                event.preventDefault();
                onTextChange(nextValue);
                selectionRef.current = { start: nextValue.length, end: nextValue.length };
                setIsFullscreen(false);
                setLongTextCollapsed(true);
                requestAnimationFrame(() => longTextTriggerRef.current?.focus());
              }}
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
              className={`absolute caret-white placeholder:[-webkit-text-fill-color:#a1a1aa] ${textClassName} ${isLongTextCollapsed ? "pointer-events-none invisible" : ""}`}
              style={{ color: "transparent", WebkitTextFillColor: "transparent", overflowY: isStacked && measurements.stacked > textHeight ? "auto" : "hidden" }}
            />

            <motion.span initial={false} animate={{ opacity: showControls ? 0 : 1, scale: showControls ? 0.9 : 1 }} transition={transition} className="pointer-events-none absolute bottom-3 left-[13px] text-zinc-300">
              <ComposerIcon name="message" />
            </motion.span>
            <motion.button
              ref={attachmentTriggerRef}
              type="button"
              initial={false}
              animate={{ opacity: showControls ? 1 : 0, scale: showControls ? attachmentsOpen ? 0.96 : 1 : 0.9, rotate: reduceMotion ? 0 : attachmentsOpen ? 45 : 0, y: 0, bottom: controlBottom, left: 8 }}
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
              className={`absolute size-8 border border-white/10 bg-white/[0.035] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] ${buttonClassName}`}
              style={{ pointerEvents: showControls ? "auto" : "none", transformOrigin: "center" }}
            >
              <ComposerIcon name="plus" />
            </motion.button>
            {/* Surge ao lado do +, reservando espaço no texto com a mesma transição. */}
            <motion.button
              ref={emojiTriggerRef}
              type="button"
              initial={false}
              animate={{ opacity: isFocused ? 1 : 0, scale: isFocused ? 1 : 0.85, x: isFocused ? 0 : -8, bottom: controlBottom, left: 46 }}
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
              className={`absolute size-8 border border-white/10 bg-white/[0.035] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] ${buttonClassName}`}
              style={{ pointerEvents: isFocused ? "auto" : "none" }}
            >
              <ComposerIcon name="sticker" />
            </motion.button>
            <motion.button
              type="button"
              initial={false}
              animate={{
                opacity: text.trim() ? 1 : 0,
                scale: text.trim() ? 1 : 0.75,
                bottom: controlBottom,
                right: isStacked ? isRecording ? 128 : 90 : isRecording ? 84 : 46,
              }}
              transition={transition}
              whileHover={reduceMotion || rewriting ? undefined : { scale: 1.06 }}
              whileTap={reduceMotion || rewriting ? undefined : { scale: 0.9 }}
              aria-label="Resumir e melhorar texto com IA"
              title={rewriteError ?? "Resumir e melhorar com IA"}
              aria-hidden={!text.trim()}
              tabIndex={text.trim() ? 0 : -1}
              disabled={!text.trim() || rewriting || sending}
              onClick={() => void handleRewrite()}
              className="group absolute flex size-8 items-center justify-center rounded-full text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:opacity-60"
              style={{ pointerEvents: text.trim() ? "auto" : "none", filter: text.trim() ? "drop-shadow(0 0 7px rgba(167,139,250,0.7))" : undefined }}
            >
              {rewriting ? (
                <svg className="size-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute inset-1 animate-pulse rounded-full bg-violet-500/25 blur-sm transition-opacity duration-300 group-hover:opacity-0 motion-reduce:animate-none"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 scale-75 rounded-full bg-violet-400/40 opacity-0 blur-md transition-[transform,opacity] duration-500 ease-out group-hover:scale-110 group-hover:opacity-100"
                  />
                  <span className="relative transition-transform duration-300 ease-out group-hover:scale-105">
                    <ComposerIcon name="sparkles" />
                  </span>
                </>
              )}
            </motion.button>
            <span className="sr-only" role="status" aria-live="polite">{rewriteError ?? (rewriting ? "Reformulando mensagem" : "")}</span>
            <motion.button
              type="button"
              initial={false}
              animate={{
                opacity: showControls ? 1 : 0,
                width: 32,
                height: 32,
                borderRadius: 999,

                scale: isRecording
                  ? [1, 1.08, 1]
                  : showControls
                    ? 1
                    : 0.9,

                bottom: controlBottom,
                right: isStacked ? 52 : 8,
              }}
              transition={
                isRecording
                  ? {
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
                  : transition
              }
              aria-label={
                isRecording
                  ? "Parar gravação"
                  : "Gravar áudio"
              }
              title={
                isRecording
                  ? "Parar gravação"
                  : "Gravar áudio"
              }
              aria-hidden={!showControls}
              tabIndex={showControls ? 0 : -1}
              disabled={!showControls || sending}
              onClick={() => {
                if (isRecording) {
                  stopRecording();
                } else {
                  void startRecording();
                }
              }}
              className={`absolute border shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] ${buttonClassName} ${isRecording
                  ? "border-red-400/40 bg-red-500/20 text-red-300"
                  : "border-white/10 bg-white/[0.035]"
                }`}
              style={{
                pointerEvents: showControls
                  ? "auto"
                  : "none",
              }}
            >
              {isRecording ? (
                <span className="flex h-4 items-center gap-[2px] text-red-300" aria-label={`Gravando ${formatRecordingTime(recordingSeconds)}`}>
                  {audioLevels.map((level, index) => (
                    <span
                      key={index}
                      className="w-[2px] rounded-full bg-current transition-[height] duration-75"
                      style={{ height: `${Math.max(4, Math.round(level * 16))}px` }}
                    />
                  ))}
                  <span className="pointer-events-none absolute right-full mr-2 min-w-[31px] text-[10px] font-medium tabular-nums text-red-200">{formatRecordingTime(recordingSeconds)}</span>
                </span>
              ) : (
                <ComposerIcon name="mic" />
              )}
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
            animate={{ width: isStacked ? 36 : 44, height: isStacked ? 36 : 44, right: isStacked ? 8 : 0, bottom: isStacked ? 8 : 0 }}
            transition={transition}
            disabled={sending || (!text.trim() && !pendingFile)}
            aria-busy={sending}
            aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
            title="Enviar mensagem"
            className={`absolute flex items-center justify-center overflow-hidden rounded-full border bg-gradient-to-br from-white/[0.12] via-white/[0.03] to-transparent shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),inset_0_-1px_1px_rgba(0,0,0,0.16),0_4px_16px_rgba(0,0,0,0.18)] backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,color,box-shadow] duration-250 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/50 motion-reduce:transition-none ${text.trim() || pendingFile ? "border-emerald-200/20 bg-emerald-600/60 text-white enabled:hover:bg-emerald-500/70 enabled:hover:border-emerald-100/30" : "border-white/10 bg-emerald-950/25 text-white/45"}`}
          >
            {sending ? (
              <svg className="size-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            ) : <ComposerIcon name="send" />}
          </motion.button>
          <AttachmentMenu open={attachmentsOpen && !sending} triggerRef={attachmentTriggerRef} onClose={closeAttachments} onSelect={selectAttachment} closing={closing} onCloseWithBot={onCloseWithBot} allowCloseWithBot={allowCloseWithBot} stacked={isStacked} />
          <EmojiSelector id={emojiSelectorId} open={emojisOpen && !sending} triggerRef={emojiTriggerRef} onClose={closeEmojis} onSelect={selectEmoji} fieldHeight={fieldHeight} rightInset={isStacked ? 0 : 56} />
          {/* Seleciona o arquivo localmente; a integração de envio de mídia é uma etapa separada. */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setPendingFile(file);
              setAttachmentError(null);
              event.target.value = "";
              textareaRef.current?.focus();
            }}
          />
        </form>
      </div>
    </div >
  );
}
