"use client";

import { useRef, useState } from "react";
import { translateMessage } from "@/lib/chat-api";

export type MessageTranslationState = {
  visible: boolean;
  status: "loading" | "success" | "error";
  text?: string;
  error?: string;
};

export function useMessageTranslations() {
  const [translations, setTranslations] = useState<Record<string, MessageTranslationState>>({});
  const pending = useRef(new Set<string>());
  // Include content so an edited message cannot reuse an outdated translation.
  const keyFor = (id: number, text: string) => JSON.stringify([id, text]);

  function getTranslation(id: number, text: string) {
    return translations[keyFor(id, text)];
  }

  function hideTranslation(id: number, text: string) {
    const key = keyFor(id, text);
    setTranslations((current) => current[key] ? { ...current, [key]: { ...current[key], visible: false } } : current);
  }

  async function toggleTranslation(id: number, text: string) {
    const key = keyFor(id, text);
    const cached = translations[key];
    if (cached?.text) {
      setTranslations((current) => ({ ...current, [key]: { ...current[key], visible: !current[key].visible } }));
      return;
    }
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setTranslations((current) => ({ ...current, [key]: { visible: true, status: "loading" } }));
    try {
      const translated = await translateMessage(text);
      setTranslations((current) => ({ ...current, [key]: { visible: current[key]?.visible ?? true, status: "success", text: translated } }));
    } catch (error) {
      setTranslations((current) => ({ ...current, [key]: { visible: current[key]?.visible ?? true, status: "error", error: error instanceof Error ? error.message : "Não foi possível traduzir a mensagem." } }));
    } finally {
      pending.current.delete(key);
    }
  }

  return { getTranslation, toggleTranslation, hideTranslation };
}
