"use client";

import { useEffect, useRef } from "react";

// O teclado pode reduzir apenas a visual viewport (Safari/iOS e alguns browsers
// Android), sem alterar as unidades dvh usadas pelo layout da conversa.
export function useMobileVisualViewport() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mobile = window.matchMedia("(max-width: 1023px)");
    const viewport = window.visualViewport;
    let frame = 0;
    let restingHeight = window.innerHeight;
    let previousWidth = window.innerWidth;

    const sync = () => {
      frame = 0;
      if (!mobile.matches || !viewport) {
        root.style.removeProperty("--chat-viewport-height");
        root.style.removeProperty("--chat-viewport-top");
        delete root.dataset.keyboardOpen;
        return;
      }

      // Usa a altura visível diretamente: se o layout já foi reduzido pelo
      // navegador, não há uma segunda compensação da altura do teclado.
      root.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`);

      const editing = document.activeElement?.matches("textarea, input, [contenteditable='true']") ?? false;
      if (!editing || previousWidth !== window.innerWidth) {
        restingHeight = Math.max(window.innerHeight, viewport.height);
        previousWidth = window.innerWidth;
      }
      // A safe area inferior pertence ao rodapé da tela, não ao teclado.
      // Mantém a referência anterior ao foco também no Android resizes-content.
      root.dataset.keyboardOpen = String(editing && restingHeight - viewport.height > restingHeight * 0.2);
    };

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    scheduleSync();
    viewport?.addEventListener("resize", scheduleSync);
    viewport?.addEventListener("scroll", scheduleSync);
    window.addEventListener("resize", scheduleSync);
    document.addEventListener("focusin", scheduleSync);
    document.addEventListener("focusout", scheduleSync);
    mobile.addEventListener("change", scheduleSync);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", scheduleSync);
      viewport?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      document.removeEventListener("focusin", scheduleSync);
      document.removeEventListener("focusout", scheduleSync);
      mobile.removeEventListener("change", scheduleSync);
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-viewport-top");
      delete root.dataset.keyboardOpen;
    };
  }, []);

  return rootRef;
}
