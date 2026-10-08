"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push-api";
import { ensurePushSubscription, isPushSupported } from "@/lib/pwa";

type Options = {
  // Permite reaproveitar o fluxo de permissão já usado pelas notificações do navegador.
  requestPermission?: () => Promise<NotificationPermission | "unsupported">;
};

async function getCurrentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function usePushSubscription({ requestPermission }: Options = {}) {
  const [supported] = useState(isPushSupported);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza o estado com a assinatura existente e garante que ela pertença ao usuário atual.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    getCurrentSubscription()
      .then(async (subscription) => {
        if (cancelled) return;
        setSubscribed(Boolean(subscription));
        if (subscription) await subscribeToPush(subscription.toJSON());
      })
      .catch((reason) => console.error(reason))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    setLoading(true);
    setError(null);
    try {
      const permission = requestPermission
        ? await requestPermission()
        : await window.Notification.requestPermission();
      if (permission !== "granted") {
        setError("Permita as notificações no navegador para ativar o push.");
        return false;
      }

      await ensurePushSubscription();
      setSubscribed(true);
      return true;
    } catch (reason) {
      console.error(reason);
      setError("Não foi possível ativar as notificações push. Tente novamente.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [requestPermission, supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      const subscription = await getCurrentSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (reason) {
      console.error(reason);
      setError("Não foi possível desativar as notificações push. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, subscribed, loading, error, subscribe, unsubscribe };
}
