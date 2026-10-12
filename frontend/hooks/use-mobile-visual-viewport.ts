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

    const sync = () => {
      frame = 0;
      if (!mobile.matches || !viewport) {
        root.style.removeProperty("--chat-viewport-height");
        root.style.removeProperty("--chat-viewport-top");
        return;
      }

      // Usa a altura visível diretamente: se o layout já foi reduzido pelo
      // navegador, não há uma segunda compensação da altura do teclado.
      root.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--chat-viewport-top", `${viewport.offsetTop}px`);
    };

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    scheduleSync();
    viewport?.addEventListener("resize", scheduleSync);
    viewport?.addEventListener("scroll", scheduleSync);
    window.addEventListener("resize", scheduleSync);
    mobile.addEventListener("change", scheduleSync);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", scheduleSync);
      viewport?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      mobile.removeEventListener("change", scheduleSync);
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-viewport-top");
    };
  }, []);

  return rootRef;
}
