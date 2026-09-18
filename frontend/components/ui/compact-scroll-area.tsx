"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type CompactScrollAreaProps = {
  children: ReactNode;
  className?: string;
  label: string;
};

// Mantém a rolagem nativa do conteúdo, substituindo apenas o indicador visual.
export function CompactScrollArea({ children, className = "", label }: CompactScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef(0);
  const viewportId = useId();
  const [metrics, setMetrics] = useState({ top: 0, max: 0, track: 0 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const measure = () => setMetrics({
      top: viewport.scrollTop,
      max: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      track: Math.max(0, viewport.clientHeight - 20),
    });
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  // O indicador permanece curto mesmo quando há pouco conteúdo excedente.
  const thumbHeight = Math.min(24, metrics.track);
  const travel = Math.max(0, metrics.track - thumbHeight);
  const thumbTop = metrics.max ? (metrics.top / metrics.max) * travel : 0;

  function scrollToPointer(clientY: number, offset: number) {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || !travel) return;
    const fraction = (clientY - track.getBoundingClientRect().top - offset) / travel;
    viewport.scrollTop = Math.max(0, Math.min(1, fraction)) * metrics.max;
  }

  return (
    <div className={`relative min-h-0 ${className}`}>
      <div id={viewportId} ref={viewportRef} tabIndex={0} aria-label={label} className="compact-scroll-viewport h-full overflow-y-auto pr-2 focus-visible:outline-1 focus-visible:outline-zinc-600">
        <div ref={contentRef}>{children}</div>
      </div>
      {metrics.max > 0 && (
        <div
          ref={trackRef}
          className="absolute top-2.5 right-0 bottom-2.5 w-2"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) scrollToPointer(event.clientY, thumbHeight / 2);
          }}
        >
          <div
            role="scrollbar"
            tabIndex={0}
            aria-label={`Rolar ${label}`}
            aria-controls={viewportId}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={Math.ceil(metrics.max)}
            aria-valuenow={Math.round(metrics.top)}
            className="absolute right-0.5 w-1 touch-none rounded-full bg-zinc-500/60 transition-colors hover:bg-zinc-400 active:bg-zinc-300 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-zinc-400"
            style={{ top: thumbTop, height: thumbHeight }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              dragOffset.current = event.clientY - event.currentTarget.getBoundingClientRect().top;
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.focus();
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) scrollToPointer(event.clientY, dragOffset.current);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              const viewport = viewportRef.current;
              if (!viewport) return;
              const positions: Record<string, number> = {
                ArrowUp: viewport.scrollTop - 40,
                ArrowDown: viewport.scrollTop + 40,
                PageUp: viewport.scrollTop - viewport.clientHeight,
                PageDown: viewport.scrollTop + viewport.clientHeight,
                Home: 0,
                End: metrics.max,
              };
              const position = positions[event.key];
              if (position !== undefined) {
                event.preventDefault();
                viewport.scrollTop = position;
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
