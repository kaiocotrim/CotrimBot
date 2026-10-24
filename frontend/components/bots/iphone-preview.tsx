"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./bot-designer.module.css";

// Display ratio from Apple's 1320 × 2868 specification, at one-third scale.
const SCREEN_WIDTH = 440;
const SCREEN_HEIGHT = 956;

export function IPhonePreview({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const scale = Math.max(0, Math.min(1, width / SCREEN_WIDTH, height / SCREEN_HEIGHT));
      element.style.setProperty("--phone-scale", String(scale));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={viewport} className={styles.phoneViewport}>
    <div className={styles.phoneDevice}>
      <div className={styles.phone} role="group" aria-label="Prévia de iPhone Pro Max">{children}</div>
    </div>
  </div>;
}
