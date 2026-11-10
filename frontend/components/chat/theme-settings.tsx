"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { readTheme, setTheme, subscribeTheme, type ThemePreference } from "@/lib/app-theme";
import styles from "./theme-settings.module.css";

const options = [
  { value: "light", label: "Claro", description: "Fundos claros e textos escuros.", icon: Sun },
  { value: "dark", label: "Escuro", description: "Fundos escuros e tons suaves.", icon: Moon },
  { value: "system", label: "Sistema", description: "Acompanha o tema do seu dispositivo.", icon: Monitor },
] as const;
const serverTheme = (): ThemePreference => "dark";

export function ThemeSettings() {
  const preference = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  return <section className={styles.root} aria-labelledby="theme-title">
    <div><h3 id="theme-title">Aparência</h3><p>Escolha o tema que fica melhor para você.</p></div>
    <fieldset className={styles.options}>
      <legend className="sr-only">Tema do aplicativo</legend>
      {options.map(({ value, label, description, icon: Icon }) => <label key={value} className={styles.option} data-selected={preference === value}>
        <input type="radio" name="app-theme" value={value} checked={preference === value} onChange={() => setTheme(value)} className="sr-only" />
        <span aria-hidden="true" className={styles.preview} data-preview={value}>
          <span className={styles.previewSidebar}><i /><i /><i /></span>
          <span className={styles.previewChat}><i /><i /><i /></span>
        </span>
        <span className={styles.optionTitle}><Icon size={17} aria-hidden="true" />{label}<span aria-hidden="true" className={styles.radio} /></span>
        <span className={styles.description}>{description}</span>
      </label>)}
    </fieldset>
    <p className={styles.saved} role="status">Tema aplicado: {options.find((option) => option.value === preference)?.label}. Sua escolha fica salva neste navegador.</p>
  </section>;
}
