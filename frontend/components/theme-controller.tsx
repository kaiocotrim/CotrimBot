"use client";

import { useEffect } from "react";
import { applyTheme, readTheme, subscribeTheme } from "@/lib/app-theme";

export function ThemeController() {
  useEffect(() => {
    const sync = () => applyTheme(readTheme());
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    sync();
    const unsubscribe = subscribeTheme(sync);
    system.addEventListener("change", sync);
    return () => { unsubscribe(); system.removeEventListener("change", sync); };
  }, []);
  return null;
}
