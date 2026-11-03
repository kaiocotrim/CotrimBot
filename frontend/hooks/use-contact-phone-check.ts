"use client";

import { useEffect, useState } from "react";
import { checkContactPhone, type ContactPhoneCheck } from "@/lib/chat-api";

type CheckState = { phone: string | null; attempt: number; result: ContactPhoneCheck | null; error: string | null };

export function useContactPhoneCheck(phone: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CheckState>({ phone: null, attempt: 0, result: null, error: null });
  useEffect(() => {
    if (!phone) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void checkContactPhone(phone, controller.signal).then(result => {
        if (!controller.signal.aborted) setState({ phone, attempt, result, error: null });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ phone, attempt, result: null, error: error instanceof Error ? error.message : "Não foi possível verificar o número." });
      });
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [phone, attempt]);

  const current = Boolean(phone && state.phone === phone && state.attempt === attempt);
  return {
    checking: Boolean(phone && (!current || !state.result && !state.error)),
    result: current ? state.result : null,
    error: current ? state.error : null,
    retry: () => setAttempt(value => value + 1),
  };
}
