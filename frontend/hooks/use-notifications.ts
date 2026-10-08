"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";
import {
  clearNotifications as clearNotificationsRequest,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notification-api";
import { isNotificationSoundEnabled, playNotificationSound } from "@/lib/notification-sound";
import { ensurePushSubscription } from "@/lib/pwa";

type Options = {
  selectedContactId?: number;
  onOpenContact: (contactId: number) => void;
};

export function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

export function useNotifications({ selectedContactId, onOpenContact }: Options) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(readNotificationPermission);

  // Os listeners do socket são registrados uma vez; os valores atuais ficam em refs.
  const selectedContactIdRef = useRef(selectedContactId);
  const onOpenContactRef = useRef(onOpenContact);
  const notificationsRef = useRef(notifications);
  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
    onOpenContactRef.current = onOpenContact;
    notificationsRef.current = notifications;
  });

  useEffect(() => {
    // O app aberto por um clique em notificação push chega com ?notificationId=.
    const openedId = Number(new URLSearchParams(window.location.search).get("notificationId"));
    const markOpened = Number.isInteger(openedId) && openedId > 0
      ? markNotificationRead(openedId).catch((error) => console.error(error))
      : Promise.resolve();

    markOpened
      .then(() => getNotifications())
      .then((result) => {
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
      })
      .catch((error) => console.error(error));
  }, []);

  // Quem já autorizou as notificações antes do push existir também precisa ter a assinatura salva.
  useEffect(() => {
    ensurePushSubscription().catch((error) => console.error(error));
  }, []);

  const markRead = useCallback((id: number) => {
    setNotifications((current) => current.map((item) => item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((current) => Math.max(0, current - 1));
    void markNotificationRead(id).catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    function handleCreated(notification: AppNotification) {
      setNotifications((current) => [notification, ...current].slice(0, 50));
      setUnreadCount((current) => current + 1);
      if (isNotificationSoundEnabled()) playNotificationSound();

      if ("Notification" in window && window.Notification.permission === "granted") {
        const desktopNotification = new window.Notification(notification.title, {
          body: notification.body,
          tag: `cotrimbot-${notification.id}`,
          icon: "/favicon.ico",
        });
        desktopNotification.onclick = () => {
          window.focus();
          desktopNotification.close();
          if (notification.contactId) onOpenContactRef.current(notification.contactId);
          markRead(notification.id);
        };
      }
    }

    socket.on("notification_created", handleCreated);
    return () => {
      socket.off("notification_created", handleCreated);
    };
  }, [markRead]);

  // Cliques em notificações push (service worker) com o app já aberto abrem a conversa.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function handleMessage(event: MessageEvent) {
      const data = event.data as { type?: string; notificationId?: unknown; contactId?: unknown } | null;
      if (data?.type !== "cotrimbot:notification-click") return;
      if (typeof data.contactId === "number") onOpenContactRef.current(data.contactId);
      if (typeof data.notificationId === "number") {
        const item = notificationsRef.current.find((notification) => notification.id === data.notificationId);
        if (item && !item.readAt) markRead(item.id);
      }
    }
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [markRead]);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return "unsupported" as const;
    const result = await window.Notification.requestPermission();
    setPermission(result);
    if (result === "granted") ensurePushSubscription().catch((error) => console.error(error));
    return result;
  }, []);

  const markAllRead = useCallback(() => {
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
    setUnreadCount(0);
    void markAllNotificationsRead().catch((error) => console.error(error));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    void clearNotificationsRequest().catch((error) => console.error(error));
  }, []);

  return { notifications, unreadCount, permission, requestPermission, markRead, markAllRead, clearAll };
}
