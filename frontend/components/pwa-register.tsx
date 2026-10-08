"use client";

import { useEffect } from "react";
import { isServiceWorkerSupported, PWA_ENABLED, registerServiceWorker } from "@/lib/pwa";

// Registra o service worker (cache offline e notificações push) somente em produção.
export function PwaRegister() {
  useEffect(() => {
    if (!PWA_ENABLED || !isServiceWorkerSupported()) return;
    registerServiceWorker().catch((error) => console.error("Não foi possível registrar o service worker:", error));
  }, []);

  return null;
}
