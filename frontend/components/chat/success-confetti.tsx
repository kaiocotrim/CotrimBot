"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { Confetti } from "@/components/chat/confetti";

export function SuccessConfetti({ onComplete, origin }: {
  onComplete: () => void;
  origin: { x: number; y: number };
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timeout = window.setTimeout(onComplete, reduceMotion ? 0 : 8_000);
    return () => window.clearTimeout(timeout);
  }, [onComplete, reduceMotion]);

  if (reduceMotion || typeof document === "undefined") return null;

  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      <div className="absolute aspect-square w-[min(960px,150vw)]" style={{ left: origin.x, top: origin.y, transform: "translate(-50%, -64.583333%)" }}>
        <Confetti onComplete={onComplete} />
      </div>
    </div>,
    document.body,
  );
}
