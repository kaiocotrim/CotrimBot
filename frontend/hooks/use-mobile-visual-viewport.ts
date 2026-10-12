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
    let baselineHeight = Math.max(window.innerHeight, viewport?.height ?? 0);
    let baselineWidth = window.innerWidth;

    const sync = () => {
      frame = 0;
      if (!mobile.matches || !viewport) {
        root.style.removeProperty("--chat-viewport-height");
        root.style.removeProperty("--chat-viewport-top");
        root.removeAttribute("data-chat-keyboard-open");
        return;
      }

      if (window.innerWidth !== baselineWidth) {
        baselineWidth = window.innerWidth;
        baselineHeight = Math.max(window.innerHeight, viewport.height);
      }

      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && root.contains(focused)
        && (focused.matches("input, textarea, select") || focused.isContentEditable);
      if (!editing) baselineHeight = Math.max(window.innerHeight, viewport.height);

      // Fora da edição, 100dvh preenche a tela inteira. Em PWAs iOS a visual
      // viewport pode permanecer menor após fechar o teclado, criando uma faixa
      // abaixo do composer se sua altura for aplicada incondicionalmente.
      const keyboardOpen = editing && viewport.offsetTop + viewport.height < baselineHeight * 0.8;
      if (keyboardOpen) {
        // A altura é a área visível, não a altura do teclado: funciona também
        // quando o navegador já redimensionou a viewport de layout.
        root.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
        root.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`);
        root.setAttribute("data-chat-keyboard-open", "");
      } else {
        root.style.removeProperty("--chat-viewport-height");
        root.style.removeProperty("--chat-viewport-top");
        root.removeAttribute("data-chat-keyboard-open");
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
    root.addEventListener("focusin", scheduleSync);
    root.addEventListener("focusout", scheduleSync);
    mobile.addEventListener("change", scheduleSync);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", scheduleSync);
      viewport?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      root.removeEventListener("focusin", scheduleSync);
      root.removeEventListener("focusout", scheduleSync);
      mobile.removeEventListener("change", scheduleSync);
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-viewport-top");
      root.removeAttribute("data-chat-keyboard-open");
    };
  }, []);

  return rootRef;
}
