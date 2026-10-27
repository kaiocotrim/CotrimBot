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
    const standalone = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
    const viewport = window.visualViewport;
    let frame = 0;
    let restingHeight = window.innerHeight;
    let restingViewportHeight = viewport?.height ?? window.innerHeight;
    let previousWidth = window.innerWidth;
    let keyboardOpen = false;

    const sync = () => {
      frame = 0;
      root.dataset.standalone = String(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
      if (!mobile.matches || !viewport) {
        root.style.removeProperty("--chat-viewport-height");
        root.style.removeProperty("--chat-viewport-top");
        delete root.dataset.keyboardOpen;
        return;
      }

      const editing = document.activeElement?.matches("textarea, input, [contenteditable='true']") ?? false;
      if (previousWidth !== window.innerWidth) {
        restingHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport.height);
        restingViewportHeight = restingHeight;
        previousWidth = window.innerWidth;
      }
      restingHeight = Math.max(restingHeight, viewport.height);
      const obscured = restingHeight - viewport.height > restingHeight * 0.2;
      // Blur acontece antes de a animação do teclado terminar no iOS. Não
      // devolve a safe area enquanto a viewport ainda estiver encoberta.
      const keyboardClosing = keyboardOpen && viewport.height < restingViewportHeight - 1;
      keyboardOpen = keyboardClosing || (editing && obscured);
      root.dataset.keyboardOpen = String(keyboardOpen);

      if (keyboardOpen) {
        // Usa diretamente a área visível, inclusive quando o iOS a desloca.
        // Não subtrai outra altura de teclado ou de barra acessória.
        root.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
        root.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`);
      } else {
        // Em repouso, 100dvh é a referência do layout. Uma visual viewport
        // menor por UI do navegador não deve criar um segundo rodapé no PWA.
        root.style.removeProperty("--chat-viewport-height");
        root.style.removeProperty("--chat-viewport-top");
        restingViewportHeight = viewport.height;
        if (!editing) restingHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport.height);
      }
    };

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    scheduleSync();
    viewport?.addEventListener("resize", scheduleSync);
    viewport?.addEventListener("scroll", scheduleSync);
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("pageshow", scheduleSync);
    document.addEventListener("visibilitychange", scheduleSync);
    document.addEventListener("focusin", scheduleSync);
    document.addEventListener("focusout", scheduleSync);
    mobile.addEventListener("change", scheduleSync);
    standalone.addEventListener("change", scheduleSync);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", scheduleSync);
      viewport?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("pageshow", scheduleSync);
      document.removeEventListener("visibilitychange", scheduleSync);
      document.removeEventListener("focusin", scheduleSync);
      document.removeEventListener("focusout", scheduleSync);
      mobile.removeEventListener("change", scheduleSync);
      standalone.removeEventListener("change", scheduleSync);
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-viewport-top");
      delete root.dataset.keyboardOpen;
      delete root.dataset.standalone;
    };
  }, []);

  return rootRef;
}
