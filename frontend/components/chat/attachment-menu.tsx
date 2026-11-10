"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";

export type AttachmentKind = "document" | "video" | "image" | "audio" | "poll";

const options: { kind: AttachmentKind; label: string; color: string; path: string }[] = [
  { kind: "document", label: "Documento", color: "#60a5fa", path: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h6" },
  { kind: "video", label: "Vídeo", color: "#c4b5fd", path: "M4 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM16 10l6-4v12l-6-4" },
  { kind: "image", label: "Imagem", color: "#fbbf24", path: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 16l5-5 4 4 3-3 6 6M8 7h.01" },
  { kind: "audio", label: "Áudio", color: "#34d399", path: "M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-3-3c1.66 0 3 1.34 3 3ZM21 16a3 3 0 1 1-3-3c1.66 0 3 1.34 3 3Z" },
  { kind: "poll", label: "Enquete", color: "#f472b6", path: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

type AttachmentMenuProps = {
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus?: boolean) => void;
  onSelect: (kind: AttachmentKind) => void;
  closing: boolean;
  onCloseWithBot: () => void;
  allowCloseWithBot: boolean;
  allowPoll?: boolean;
  signatureEnabled: boolean;
  onToggleSignature: () => void;
  stacked: boolean;
  mobile?: boolean;
  privateEnabled: boolean;
  onTogglePrivate: () => void;
};

// Fica fora do campo com overflow-hidden para o menu não ser cortado.
export function AttachmentMenu({ open, triggerRef, onClose, onSelect, closing, onCloseWithBot, allowCloseWithBot, allowPoll = false, signatureEnabled, onToggleSignature, stacked, mobile = false, privateEnabled, onTogglePrivate }: AttachmentMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [columns, setColumns] = useState(5);
  const visibleOptions = options.filter((option) => option.kind !== "poll" || allowPoll);
  const position = (index: number) => ({ x: 22 + (index % columns) * 50, y: -60 - Math.floor(index / columns) * 50 });

  useEffect(() => {
    if (!open || mobile) return;
    const form = triggerRef.current?.closest("form");
    if (!form) return;
    const observer = new ResizeObserver(([entry]) => {
      setColumns(Math.max(1, Math.floor((entry.contentRect.width - 66) / 50) + 1));
    });
    observer.observe(form);
    return () => observer.disconnect();
  }, [open, triggerRef, mobile]);

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

  if (mobile) {
    const mobileOptions = [...visibleOptions].sort((a, b) => ["image", "video", "audio", "document", "poll"].indexOf(a.kind) - ["image", "video", "audio", "document", "poll"].indexOf(b.kind));
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-attachments"
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto overflow-hidden rounded-t-[32px] rounded-b-[24px] bg-[#171717]"
          >
            <div
              ref={menuRef}
              role="menu"
              aria-label="Opções da conversa"
              data-mobile-attachment-panel
              className="max-h-[min(420px,55dvh)] overflow-y-auto overscroll-contain px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onKeyDown={(event) => {
                if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                const step = event.key === "ArrowDown" ? 4 : event.key === "ArrowUp" ? -4 : event.key === "ArrowLeft" ? -1 : 1;
                const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + step + items.length) % items.length;
                items[next]?.focus();
              }}
            >
              <div aria-hidden="true" className="mx-auto mb-4 h-1 w-8 rounded-full bg-white/25" />
              <div className="grid grid-cols-4 gap-x-1 gap-y-4 pb-5">
                {mobileOptions.map((option) => {
                  const label = option.kind === "image" ? "Fotos" : option.label;
                  return (
                    <motion.button
                      key={option.kind}
                      type="button"
                      role="menuitem"
                      aria-label={label}
                      whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                      onClick={() => onSelect(option.kind)}
                      className="flex min-h-[76px] min-w-0 flex-col items-center justify-start gap-2 rounded-2xl text-[12px] leading-4 text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      <span className="flex h-11 w-[58px] items-center justify-center rounded-[22px] bg-[#292929]" style={{ color: option.kind === "image" ? "#58a6ff" : option.kind === "document" ? "#22b8e8" : option.kind === "poll" ? "#ffbd44" : option.color }}>
                        <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={option.path} /></svg>
                      </span>
                      <span>{label}</span>
                    </motion.button>
                  );
                })}
                <motion.button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={privateEnabled}
                  aria-label="Mensagem privada"
                  whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                  onClick={onTogglePrivate}
                  className="flex min-h-[76px] min-w-0 flex-col items-center justify-start gap-2 rounded-2xl text-[12px] leading-4 text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <span className={`flex h-11 w-[58px] items-center justify-center rounded-[22px] ${privateEnabled ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40" : "bg-[#292929] text-zinc-300"}`}>
                    <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
                  </span>
                  <span>Mensagem<br />privada</span>
                </motion.button>
              </div>
              <div className="space-y-1 border-t border-white/[0.06] pt-2">
                <button type="button" role="menuitemcheckbox" aria-checked={signatureEnabled} aria-label="Assinar mensagens" onClick={onToggleSignature} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[13px] text-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                  <span>Assinar mensagens</span>
                  <span aria-hidden="true" className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${signatureEnabled ? "bg-emerald-500" : "bg-zinc-600"}`}><span className={`size-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${signatureEnabled ? "translate-x-4" : "translate-x-0"}`} /></span>
                </button>
                {allowCloseWithBot && <button type="button" role="menuitem" disabled={closing} aria-busy={closing} onClick={onCloseWithBot} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] text-red-300 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50">
                  <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="4" /><path d="M12 2v4M8 11h.01M16 11h.01M9 16h6M2 11v4M22 11v4" /></svg>
                  {closing ? "Encerrando..." : "Encerrar chamado com Bot"}
                </button>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

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
          {visibleOptions.map((option, index) => (
            <motion.button key={option.kind} type="button" role="menuitem" title={option.label} aria-label={option.label}
              variants={{ closed: { opacity: 0, scale: 0.4, x: 0, y: 0 }, open: { opacity: 1, scale: 1, ...position(index) } }}
              transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : index * 0.035, ease: [0.22, 1, 0.36, 1] }}
              whileHover={reduceMotion ? undefined : { scale: 1.08 }}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(option.kind)}
              className="pointer-events-auto absolute bottom-0 left-0 flex size-9 items-center justify-center rounded-full border border-white/15 bg-zinc-900/95 bg-gradient-to-br from-white/10 to-transparent text-zinc-100 shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_6px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
              <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={option.path} /></svg>
              <span className="sr-only">{option.label}</span>
            </motion.button>
          ))}
          {/* Reutiliza o encerramento existente, incluindo proteção contra cliques repetidos. */}
          {allowCloseWithBot && <motion.button
            type="button"
            role="menuitem"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCloseWithBot}
            disabled={closing}
            aria-busy={closing}
            title={closing ? "Encerrando..." : "Encerrar chamado com Bot"}
            aria-label={closing ? "Encerrando..." : "Encerrar chamado com Bot"}
            variants={{ closed: { opacity: 0, scale: 0.4, x: 0, y: 0 }, open: { opacity: 1, scale: 1, ...position(visibleOptions.length) } }}
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
          </motion.button>}
          <motion.button
            type="button"
            role="menuitemcheckbox"
            aria-checked={signatureEnabled}
            aria-label="Assinar mensagens"
            title={signatureEnabled ? "Assinatura ativada · clique para desativar" : "Assinatura desativada · clique para ativar"}
            variants={{ closed: { opacity: 0, scale: 0.4, x: 0, y: 0 }, open: { opacity: 1, scale: 1, ...position(visibleOptions.length + Number(allowCloseWithBot)) } }}
            transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : allowCloseWithBot ? 0.175 : 0.14, ease: [0.22, 1, 0.36, 1] }}
            whileHover={reduceMotion ? undefined : { scale: 1.08 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleSignature}
            className={`pointer-events-auto absolute bottom-0 left-0 flex size-9 items-center justify-center rounded-full border bg-zinc-900/95 bg-gradient-to-br from-white/10 to-transparent shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_6px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 ${signatureEnabled ? "border-emerald-400/40 text-emerald-300 hover:bg-emerald-950" : "border-white/15 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m4 20 4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z" />
              <path d="m14.5 6.5 3 3" />
              {!signatureEnabled && <path d="M3 3 21 21" />}
            </svg>
            <span className="sr-only">{signatureEnabled ? "Assinatura ativada" : "Assinatura desativada"}</span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
