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
};

// Fica fora do campo com overflow-hidden para o menu não ser cortado.
export function AttachmentMenu({ open, triggerRef, onClose, onSelect }: AttachmentMenuProps) {
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
          aria-label="Anexar arquivo"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 4, scale: reduceMotion ? 1 : 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "bottom left" }}
          className="absolute bottom-14 left-1.5 z-40 w-52 max-w-[80vw] rounded-[18px] border border-white/15 bg-zinc-900/75 bg-gradient-to-br from-white/[0.08] to-transparent p-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {options.map((option) => (
            <button key={option.kind} type="button" role="menuitem" onClick={() => onSelect(option.kind)} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] text-zinc-200 transition-colors hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none">
              <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke={option.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={option.path} /></svg>
              {option.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
