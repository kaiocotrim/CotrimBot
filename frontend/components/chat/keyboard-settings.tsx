"use client";

import { useState } from "react";
import { useKeyboardPreference } from "@/hooks/use-keyboard-preference";
import styles from "./keyboard-settings.module.css";

const options = [
  { value: "shift-enter", label: "Shift + Enter", modifier: "Shift" },
  { value: "ctrl-enter", label: "Ctrl + Enter", modifier: "Ctrl" },
] as const;

export function KeyboardSettings({ userId }: { userId: string }) {
  const { shortcut, setShortcut } = useKeyboardPreference(userId);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  return <section className={styles.root} aria-labelledby="keyboard-title">
    <div><h3 id="keyboard-title">Atalhos de mensagem</h3><p>Escolha como quebrar a linha ao escrever uma mensagem. Enter envia a mensagem.</p></div>
    <fieldset className={styles.options}>
      <legend>Quebrar linha com</legend>
      {options.map(({ value, label, modifier }) => <label key={value} className={styles.option} data-selected={shortcut === value}>
        <input type="radio" name="message-newline" value={value} checked={shortcut === value} onChange={() => setStorageUnavailable(!setShortcut(value))} />
        <span className={styles.keys} aria-hidden="true"><kbd>{modifier}</kbd><span>+</span><kbd>Enter</kbd></span>
        <span className="sr-only">{label}</span>
      </label>)}
    </fieldset>
    <p role="status">{storageUnavailable ? "Preferência aplicada nesta sessão. O navegador não permitiu salvar a escolha." : "Sua escolha fica salva para seu usuário neste navegador e é aplicada ao WhatsApp e ao chat interno."}</p>
  </section>;
}
