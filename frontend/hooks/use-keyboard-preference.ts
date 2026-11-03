"use client";

import { useCallback, useSyncExternalStore } from "react";

export type NewlineShortcut = "shift-enter" | "ctrl-enter";
const CHANGE_EVENT = "cotrimbot:keyboard-preference-changed";
const defaultShortcut = (): NewlineShortcut => "shift-enter";
const sessionPreferences = new Map<string, NewlineShortcut>();

function preferenceKey(userId: string) {
  return `cotrimbot:keyboard:newline:${userId}`;
}

function readPreference(userId: string): NewlineShortcut {
  const sessionPreference = sessionPreferences.get(userId);
  if (sessionPreference) return sessionPreference;
  try {
    const value = window.localStorage.getItem(preferenceKey(userId));
    return value === "ctrl-enter" ? "ctrl-enter" : "shift-enter";
  } catch {
    return sessionPreferences.get(userId) ?? defaultShortcut();
  }
}

export function useKeyboardPreference(userId: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === preferenceKey(userId)) {
        sessionPreferences.delete(userId);
        onChange();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [userId]);
  const getSnapshot = useCallback(() => readPreference(userId), [userId]);
  const shortcut = useSyncExternalStore(subscribe, getSnapshot, defaultShortcut);
  const setShortcut = useCallback((value: NewlineShortcut) => {
    let persisted = false;
    try {
      window.localStorage.setItem(preferenceKey(userId), value);
      sessionPreferences.delete(userId);
      persisted = true;
    } catch {
      // The preference still works for this session when storage is unavailable.
      sessionPreferences.set(userId, value);
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return persisted;
  }, [userId]);
  return { shortcut, setShortcut };
}
