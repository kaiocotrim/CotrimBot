"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import styles from "./bot-designer.module.css";

function subscribeDesktop(notify: () => void) {
  const query = window.matchMedia("(min-width: 1100px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export function BotEditorPanel({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia("(min-width: 1100px)").matches, () => false);
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return <motion.div className={styles.editorPanel} data-bot-editor-panel="" inert={!present} aria-hidden={!present}
    initial={reduced ? false : { width: desktop ? 0 : "auto", opacity: 0 }}
    animate={{ width: desktop ? 312 : "auto", opacity: 1 }}
    exit={{ width: desktop ? 0 : "auto", opacity: 0 }}
    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 34, mass: 0.9 }}>
    <motion.div className={styles.editorPanelContent}
      initial={reduced ? false : { x: 14, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: reduced ? 0 : 10, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
      <button type="button" className={styles.editorClose} aria-label="Fechar edição" onClick={onClose}><X size={15} /></button>
      {children}
    </motion.div>
  </motion.div>;
}
