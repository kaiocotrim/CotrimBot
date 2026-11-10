"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import styles from "./bot-designer.module.css";

export function BotMessageField({ label, value, onChange, maxLength = 8000, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  const inline = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const enlarged = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const autoExpanded = useRef(false);

  function measureOrigin(field: HTMLTextAreaElement) {
    const bounds = field.getBoundingClientRect();
    const popup = dialog.current?.getBoundingClientRect();
    return {
      x: bounds.x + bounds.width / 2 - (popup ? popup.x + popup.width / 2 : window.innerWidth / 2),
      y: bounds.y + bounds.height / 2 - (popup ? popup.y + popup.height / 2 : window.innerHeight / 2),
      scaleX: bounds.width / (popup?.width || Math.min(720, window.innerWidth - 32)),
      scaleY: bounds.height / (popup?.height || Math.min(window.innerHeight * 0.56, 520)),
    };
  }

  function expand(field = inline.current) {
    if (field) {
      selection.current = { start: field.selectionStart, end: field.selectionEnd };
      setOrigin(measureOrigin(field));
    }
    closingRef.current = false;
    setClosing(false);
    autoExpanded.current = true;
    setExpanded(true);
  }

  function expandIfNeeded(field: HTMLTextAreaElement) {
    if (field.scrollHeight <= field.clientHeight + 2) autoExpanded.current = false;
    else if (!autoExpanded.current) expand(field);
  }

  function close() {
    if (closingRef.current) return;
    closingRef.current = true;
    if (inline.current) setOrigin(measureOrigin(inline.current));
    if (enlarged.current) selection.current = { start: enlarged.current.selectionStart, end: enlarged.current.selectionEnd };
    setClosing(true);
  }

  function finishClosing() {
    if (!closingRef.current) return;
    closingRef.current = false;
    setExpanded(false);
    setClosing(false);
    requestAnimationFrame(() => {
      inline.current?.focus({ preventScroll: true });
      inline.current?.setSelectionRange(selection.current.start, selection.current.end);
    });
  }

  useEffect(() => {
    if (!expanded) return;
    const popup = dialog.current;
    popup?.showModal();
    enlarged.current?.focus({ preventScroll: true });
    enlarged.current?.setSelectionRange(selection.current.start, selection.current.end);
    return () => { popup?.close(); };
  }, [expanded]);

  return <>
    <div className={styles.messageField}>
      <div className={styles.messageFieldHeading}>
        <label htmlFor={id}>{label}</label>
        <button type="button" className={styles.messageExpand} aria-label={`Ampliar ${label.toLocaleLowerCase("pt-BR")}`} onClick={() => expand()}><Maximize2 size={13} aria-hidden="true" /></button>
      </div>
      <textarea ref={inline} id={id} className={styles.field} style={{ visibility: expanded ? "hidden" : undefined }} maxLength={maxLength} value={value} placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); if (!(event.nativeEvent as InputEvent).isComposing) expandIfNeeded(event.currentTarget); }}
        onCompositionEnd={(event) => expandIfNeeded(event.currentTarget)} />
    </div>
    {expanded && createPortal(<dialog ref={dialog} className={styles.messageDialog} aria-label={label}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <motion.textarea ref={enlarged} aria-label={label} className={styles.messageDialogInput}
        initial={reduceMotion ? false : { ...origin, borderRadius: 12, boxShadow: "0 6px 20px #0002" }}
        animate={closing
          ? { ...(reduceMotion ? { x: 0, y: 0, scaleX: 1, scaleY: 1 } : origin), borderRadius: 12, boxShadow: "0 6px 20px #0002" }
          : { x: 0, y: 0, scaleX: 1, scaleY: 1, borderRadius: 16, boxShadow: "0 20px 70px #0006" }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: closing ? 420 : 380, damping: 38, mass: 0.8 }}
        onAnimationComplete={() => { if (closing) finishClosing(); }}
        readOnly={closing}
        value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </dialog>, document.body)}
  </>;
}
