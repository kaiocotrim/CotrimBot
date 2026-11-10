"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ListTree, X } from "lucide-react";
import styles from "./bot-designer.module.css";

export function MenuNameDialog({ initialName, creating, onClose, onConfirm }: {
  initialName: string; creating: boolean; onClose: () => void; onConfirm: (name: string) => void;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    input.current?.focus();
    input.current?.select();
    return () => element?.close();
  }, []);

  return <motion.dialog ref={dialog} className={styles.menuNameDialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    initial={reduced ? false : { opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : .2 }}>
    <form onSubmit={event => { event.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}>
      <header><span className={styles.menuDialogIcon}><ListTree size={20} /></span><h2 id={`${id}-title`}>{creating ? "Nomeie este fluxo" : "Renomear fluxo"}</h2><button type="button" className={styles.menuDialogClose} aria-label="Fechar nome do fluxo" onClick={onClose}><X size={18} /></button></header>
      <p id={`${id}-description`}>Use um nome que identifique esta etapa, como “Suporte técnico” ou “Financeiro”. Ele aparecerá na árvore e no editor do fluxo.</p>
      <label htmlFor={`${id}-name`}>Nome do fluxo</label>
      <input ref={input} id={`${id}-name`} className={styles.field} value={name} onChange={event => setName(event.target.value)} maxLength={100} placeholder="Ex.: Suporte técnico" required />
      <footer><button type="button" className={styles.button} onClick={onClose}>Cancelar</button><button type="submit" className={styles.primary} disabled={!name.trim()}>{creating ? "Criar fluxo" : "Confirmar nome"}</button></footer>
    </form>
  </motion.dialog>;
}
