"use client";

import { useEffect, useRef } from "react";

// Uma camada HTML permite animar o cursor, que seria estático em cursor: url().
export function LoadingCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const root = document.documentElement;
    let position: { x: number; y: number } | null = null;
    let frame = 0;

    function hide() {
      root.removeAttribute("data-loading-cursor");
      cursor!.hidden = true;
    }

    function update() {
      frame = 0;
      if (!position || document.hidden) {
        hide();
        return;
      }
      const target = document.elementFromPoint(position.x, position.y);
      const busy = target && getComputedStyle(target).getPropertyValue("--apple-cursor").includes("/cursors/wait-small.svg");
      if (!busy) {
        hide();
        return;
      }
      cursor!.style.transform = `translate3d(${position.x - 14}px, ${position.y - 14}px, 0)`;
      cursor!.hidden = false;
      root.setAttribute("data-loading-cursor", "true");
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    function onPointer(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
        position = null;
        hide();
        return;
      }
      position = { x: event.clientX, y: event.clientY };
      schedule();
    }

    function leave(event: PointerEvent) {
      if (!event.relatedTarget) reset();
    }

    function reset() {
      position = null;
      hide();
    }

    // Reavalia o carregamento mesmo quando o mouse estiver parado.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-busy", "class", "disabled"],
    });
    document.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerover", onPointer, { passive: true });
    document.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("pointerout", leave);
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("visibilitychange", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerover", onPointer);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("visibilitychange", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", schedule);
      hide();
    };
  }, []);

  return (
    <div ref={cursorRef} hidden aria-hidden="true" className="apple-loading-cursor">
      <div className="apple-loading-cursor-wheel" />
    </div>
  );
}
