"use client";

import { motion, useReducedMotion } from "framer-motion";
import { memo } from "react";

type TypingIndicatorProps = {
  label: string;
  className?: string;
};

// Compartilha os pontos do cabeçalho e do composer sem estado por quadro.
export const TypingIndicator = memo(function TypingIndicator({
  label,
  className = "text-emerald-400",
}: TypingIndicatorProps) {
  const reduceMotion = useReducedMotion();

  return (
    <span role="status" aria-label={label} className={`flex h-4 items-center gap-1 ${className}`}>
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          aria-hidden="true"
          className="size-1 rounded-full bg-current"
          animate={reduceMotion ? undefined : { y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.72, repeat: Infinity, ease: "easeInOut", delay: dot * 0.12 }}
        />
      ))}
    </span>
  );
});
