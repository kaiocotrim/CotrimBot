"use client";

import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import styles from "./emoji-selector.module.css";

async function loadPicker() {
  const [{ default: EmojiPicker }, { default: data }] = await Promise.all([
    import("emoji-picker-react"),
    import("emoji-picker-react/dist/data/emojis-pt.js"),
  ]);
  return function PortuguesePicker(props: import("emoji-picker-react").PickerProps) {
    return <EmojiPicker {...props} emojiData={data} />;
  };
}

let pickerPromise: ReturnType<typeof loadPicker> | undefined;
function preparePicker() {
  return pickerPromise ??= loadPicker().catch((error) => {
    pickerPromise = undefined;
    throw error;
  });
}

export function preloadEmojiPicker() {
  void preparePicker().catch(() => {});
}

const Picker = dynamic(preparePicker, { ssr: false, loading: () => <p role="status" className="p-5 text-xs">Carregando emojis...</p> });

const pickerStyle = {
  "--epr-bg-color": "transparent",
  "--epr-picker-border-color": "transparent",
  "--epr-text-color": "#e4e4e7",
  "--epr-category-label-bg-color": "rgba(24,24,27,0.9)",
  "--epr-search-input-bg-color": "rgba(255,255,255,0.05)",
  "--epr-hover-bg-color": "rgba(255,255,255,0.08)",
  "--epr-focus-bg-color": "rgba(255,255,255,0.08)",
  "--epr-highlight-color": "#34d399",
  "--epr-emoji-size": "28px",
  "--epr-emoji-padding": "8px",
  "--epr-header-padding": "10px 16px",
  "--epr-search-input-border-radius": "999px",
  "--epr-search-input-height": "42px",
  "--epr-search-input-bg-color-active": "rgba(9,9,11,0.6)",
  "--epr-search-border-color": "#2f2f33",
  "--epr-search-border-color-active": "#34d399",
  "--epr-search-input-text-color": "#e4e4e7",
  "--epr-search-input-placeholder-color": "#a1a1aa",
  "--epr-category-icon-active-color": "#34d399",
  "--epr-category-icon-inactive-color": "#a1a1aa",
} as CSSProperties;

const privatePickerStyle = {
  ...pickerStyle,
  "--epr-bg-color": "#fff",
  "--epr-text-color": "#3f3f46",
  "--epr-category-label-bg-color": "#fff",
  "--epr-search-input-bg-color": "#f4f4f5",
  "--epr-hover-bg-color": "#e4e4e7",
  "--epr-hover-bg-color-reduced-opacity": "rgba(228,228,231,0.5)",
  "--epr-focus-bg-color": "#e4e4e7",
  "--epr-highlight-color": "#52525b",
  "--epr-search-input-bg-color-active": "#fff",
  "--epr-search-border-color": "#d4d4d8",
  "--epr-search-border-color-active": "#71717a",
  "--epr-search-input-text-color": "#18181b",
  "--epr-search-input-placeholder-color": "#71717a",
  "--epr-category-icon-active-color": "#3f3f46",
  "--epr-category-icon-inactive-color": "#71717a",
} as CSSProperties;

type EmojiSelectorProps = {
  id: string;
  open: boolean;
  isPrivateMode: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus?: boolean) => void;
  onSelect: (emoji: string) => void;
  fieldHeight: number;
  rightInset: number;
};

export function EmojiSelector({ id, open, isPrivateMode, triggerRef, onClose, onSelect, fieldHeight, rightInset }: EmojiSelectorProps) {
  const selectorRef = useRef<HTMLDivElement>(null);
  const categoryAnimationRef = useRef<{ stop: () => void } | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    return () => {
      categoryAnimationRef.current?.stop();
      categoryAnimationRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => {
      selectorRef.current?.querySelector<HTMLInputElement>("input.epr-search")?.focus({ preventScroll: true });
    });
    const handleOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!selectorRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [open, onClose, triggerRef]);

  return (
        <motion.div
          ref={selectorRef}
          id={id}
          role="dialog"
          aria-hidden={!open}
          inert={!open}
          aria-label="Selecionar emoji"
          // Anima a rolagem vertical e preserva o observer da categoria ativa.
          onClickCapture={(event) => {
            if (!(event.target instanceof Element)) return;
            const category = event.target.closest(".epr-category-nav .epr-cat-btn");
            if (!category || category.getAttribute("aria-selected") === "true") return;
            if (category.closest(".epr-search-active")) return;
            const body = selectorRef.current?.querySelector<HTMLElement>(".epr-body");
            const section = Array.from(body?.querySelectorAll<HTMLElement>(".epr-emoji-category") ?? [])
              .find((item) => item.getAttribute("aria-label") === category.getAttribute("aria-label"));
            if (!body || !section) return;
            // Impede o salto interno antes de iniciar a animacao.
            event.stopPropagation();
            categoryAnimationRef.current?.stop();
            const destination = Math.max(0, Math.min(section.offsetTop, body.scrollHeight - body.clientHeight));
            // O navegador controla os quadros da rolagem sem um loop JS adicional.
            body.scrollTo({ top: destination, behavior: reduceMotion ? "instant" : "smooth" });
            categoryAnimationRef.current = {
              stop: () => body.scrollTo({ top: body.scrollTop, behavior: "instant" }),
            };
          }}
          onWheelCapture={() => categoryAnimationRef.current?.stop()}
          // Busca e botões continuam recebendo cliques e foco normalmente.
          onPointerDown={(event) => {
            if (event.target instanceof Element && event.target.closest(".epr-body")) {
              categoryAnimationRef.current?.stop();
            }
            if (event.target instanceof Element && !event.target.closest("button, input, select, textarea, a[href], [tabindex]")) {
              event.preventDefault();
            }
          }}
          // Preserva a grade e anima só composição, sem recalcular sua altura.
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
          animate={open
            ? { opacity: 1, y: 0, display: "block" }
            : { opacity: 0, y: reduceMotion ? 0 : 8, transitionEnd: { display: "none" } }}
          transition={{
            duration: reduceMotion ? 0 : 0.18,
            ease: [0.4, 0, 0.2, 1],
          }}
          style={{ transformOrigin: "bottom left", bottom: fieldHeight - 1, right: rightInset, borderBottomWidth: 0 }}
          className={`${styles.selector} absolute left-0 z-40 overflow-hidden rounded-t-[24px] border bg-gradient-to-br from-white/[0.04] to-transparent shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_-12px_36px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150 ${isPrivateMode ? `${styles.privateSelector} border-zinc-200 bg-white text-zinc-600` : "border-[#2f2f33] bg-zinc-900/95 text-zinc-400"}`}
          // Enter na busca nunca deve disparar o envio do formulário do chat.
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
          }}
        >
          <div>
          <Picker
            theme={(isPrivateMode ? "light" : "dark") as import("emoji-picker-react").Theme}
            emojiStyle={"apple" as import("emoji-picker-react").EmojiStyle}
            suggestedEmojisMode={"recent" as import("emoji-picker-react").SuggestionMode}
            width="100%"
            height="min(420px, 50dvh)"
            style={isPrivateMode ? privatePickerStyle : pickerStyle}
            searchPlaceholder="Pesquisar emoji"
            categories={[
              { category: "suggested" as import("emoji-picker-react").Categories, name: "Recentes" },
              { category: "smileys_people" as import("emoji-picker-react").Categories, name: "Smileys e pessoas" },
              { category: "animals_nature" as import("emoji-picker-react").Categories, name: "Animais e natureza" },
              { category: "food_drink" as import("emoji-picker-react").Categories, name: "Comidas e bebidas" },
              { category: "travel_places" as import("emoji-picker-react").Categories, name: "Viagens e lugares" },
              { category: "activities" as import("emoji-picker-react").Categories, name: "Atividades" },
              { category: "objects" as import("emoji-picker-react").Categories, name: "Objetos" },
              { category: "symbols" as import("emoji-picker-react").Categories, name: "Símbolos" },
              { category: "flags" as import("emoji-picker-react").Categories, name: "Bandeiras" },
            ]}
            searchClearButtonLabel="Limpar busca"
            previewConfig={{ showPreview: false }}
            lazyLoadEmojis
            autoFocusSearch={open}
            onEmojiClick={(data) => onSelect(data.emoji)}
          />
          <div className="flex items-center justify-center px-4 pb-3 pt-2">
            <div className={`flex h-9 overflow-hidden rounded-full border ${isPrivateMode ? "border-zinc-200 bg-zinc-100" : "border-white/10 bg-black/15"}`} aria-label="Tipos de conteúdo">
              <span className={`flex w-16 items-center justify-center ${isPrivateMode ? "bg-zinc-200 text-zinc-700" : "bg-white/5 text-emerald-400"}`} aria-label="Emojis">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 3 4 3 4-3 4-3M8.5 8.5h.01M15.5 8.5h.01" /></svg>
              </span>
              <button type="button" disabled title="GIFs em breve" className={`w-16 border-l text-xs font-semibold ${isPrivateMode ? "border-zinc-200 text-zinc-400" : "border-white/10 text-zinc-600"}`}>GIF</button>
              <button type="button" disabled title="Figurinhas em breve" aria-label="Figurinhas em breve" className={`flex w-16 items-center justify-center border-l ${isPrivateMode ? "border-zinc-200 text-zinc-400" : "border-white/10 text-zinc-600"}`}>
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 21H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8l-6 6Z" /><path d="M15 21v-4a2 2 0 0 1 2-2h4" /></svg>
              </button>
            </div>
          </div>
          </div>
        </motion.div>
  );
}
