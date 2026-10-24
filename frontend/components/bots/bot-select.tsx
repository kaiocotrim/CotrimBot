"use client";

import { useRef, useState } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import styles from "./bot-select.module.css";

type Choice = { value: string; label: string };

/** Mantém os menus também dentro da camada nativa de tela cheia. */
export function BotSelect({ label, value, options, onChange, compact = false }: {
  label: string; value: string; options: Choice[]; onChange: (value: string) => void; compact?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <Select.Root items={options} value={value} onValueChange={next => { if (next !== null) onChange(next); }} onOpenChange={open => {
    if (open) setContainer(trigger.current?.closest<HTMLElement>("dialog[open]") ?? null);
  }}>
    <Select.Trigger ref={trigger} aria-label={label} data-value={value} className={`${styles.trigger} ${compact ? styles.compact : ""}`}>
      <Select.Value className={styles.value} /><Select.Icon><ChevronDown size={14} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={container ?? undefined}>
      <Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className={styles.positioner}>
        <Select.Popup className={styles.popup}>
          <Select.List className={styles.list}>{options.map(item => <Select.Item key={item.value} value={item.value} data-value={item.value} className={styles.item}>
            <Select.ItemText className={styles.value}>{item.label}</Select.ItemText><Select.ItemIndicator><Check size={15} aria-hidden="true" /></Select.ItemIndicator>
          </Select.Item>)}</Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}
