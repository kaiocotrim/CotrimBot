"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";

function DisclosureContent({ children, id }: { children: ReactNode; id?: string }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return <motion.div id={id} inert={!present} aria-hidden={!present || undefined}
    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
    transition={reduced ? { duration: 0 } : { height: { duration: .3, ease: [.22, 1, .36, 1] }, opacity: { duration: .18 } }}
    style={{ overflow: "hidden" }}>
    {children}
  </motion.div>;
}

export function BotDisclosure({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  return <AnimatePresence initial={false}>{open && <DisclosureContent key="content" id={id}>{children}</DisclosureContent>}</AnimatePresence>;
}
