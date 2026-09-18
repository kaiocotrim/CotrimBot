"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type RefObject } from "react";

export type AttachmentKind = "document" | "video" | "image" | "audio";

const options: { kind: AttachmentKind; label: string; color: string; path: string }[] = [
  { kind: "document", label: "Documento", color: "#60a5fa", path: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h6" },
  { kind: "video", label: "Vídeo", color: "#c4b5fd", path: "M4 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM16 10l6-4v12l-6-4" },
  { kind: "image", label: "Imagem", color: "#fbbf24", path: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 16l5-5 4 4 3-3 6 6M8 7h.01" },
  { kind: "audio", label: "Áudio", color: "#34d399", path: "M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-3-3c1.66 0 3 1.34 3 3ZM21 16a3 3 0 1 1-3-3c1.66 0 3 1.34 3 3Z" },
];

type AttachmentMenuProps = {
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus?: boolean) => void;
  onSelect: (kind: AttachmentKind) => void;
  closing: boolean;
  onCloseWithBot: () => void;
  stacked: boolean;
};

// Fica fora do campo com overflow-hidden para o menu não ser cortado.
export function AttachmentMenu({ open, triggerRef, onClose, onSelect, closing, onCloseWithBot, stacked }: AttachmentMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    const handleOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [open, onClose, triggerRef]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          role="menu"
          aria-label="Opções da conversa"
          initial="closed"
          animate="open"
          exit="closed"
          style={{ left: stacked ? 8 : 6, bottom: stacked ? 8 : 5 }}
          className="pointer-events-none absolute z-40 size-9"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {/* O leque abre para cima e para a direita para caber junto à lateral do chat. */}
          {options.map((option, index) => (
            <motion.button key={option.kind} type="button" role="menuitem" title={option.label} aria-label={option.label}
              variants={{ closed: { opacity: 0, scale: 0.4, x: 0, y: 0 }, open: { opacity: 1, scale: 1, x: [22, 72, 122, 172][index], y: [-52, -60, -64, -60][index] } }}
              transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : index * 0.035, ease: [0.22, 1, 0.36, 1] }}
              whileHover={reduceMotion ? undefined : { scale: 1.08 }}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              onClick={() => onSelect(option.kind)}
              className="pointer-events-auto absolute bottom-0 left-0 flex size-9 items-center justify-center rounded-full border border-white/15 bg-zinc-900/95 bg-gradient-to-br from-white/10 to-transparent text-zinc-100 shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_6px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
              <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={option.path} /></svg>
              <span className="sr-only">{option.label}</span>
            </motion.button>
          ))}
          {/* Reutiliza o encerramento existente, incluindo proteção contra cliques repetidos. */}
          <motion.button
            type="button"
            role="menuitem"
            onClick={onCloseWithBot}
            disabled={closing}
            aria-busy={closing}
            title={closing ? "Encerrando..." : "Encerrar chamado com Bot"}
            aria-label={closing ? "Encerrando..." : "Encerrar chamado com Bot"}
            variants={{ closed: { opacity: 0, scale: 0.4, x: 0, y: 0 }, open: { opacity: 1, scale: 1, x: 222, y: -52 } }}
            transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
            whileHover={reduceMotion || closing ? undefined : { scale: 1.08 }}
            whileTap={reduceMotion || closing ? undefined : { scale: 0.94 }}
            className="pointer-events-auto absolute bottom-0 left-0 flex size-9 items-center justify-center rounded-full border border-white/15 bg-zinc-900/95 bg-gradient-to-br from-white/10 to-transparent shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_6px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors enabled:hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 disabled:opacity-50"
          >
            {closing ? (
              <svg className="size-5 shrink-0 animate-spin text-red-300 motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            ) : (
              <svg className="size-5 shrink-0 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="4" /><path d="M12 2v4M8 11h.01M16 11h.01M9 16h6M2 11v4M22 11v4" /></svg>
            )}
            <span className="sr-only">{closing ? "Encerrando..." : "Encerrar chamado com Bot"}</span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
