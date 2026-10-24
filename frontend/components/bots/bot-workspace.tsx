"use client";

import type { ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";

export function BotWorkspace({ children, disabled, className }: {
  children: ReactNode; disabled: boolean; className: string;
}) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return <motion.fieldset className={className} disabled={disabled || !present} inert={!present} aria-hidden={!present || undefined}
    initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }}
    transition={{ duration: reduced ? 0 : .2, ease: [.22, 1, .36, 1] }}>
    {children}
  </motion.fieldset>;
}
