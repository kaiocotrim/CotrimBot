"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";
import {
  clearNotifications as clearNotificationsRequest,
  getNotifications,
  markContactNotificationsRead,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notification-api";
import { isNotificationSoundEnabled, playNotificationSound } from "@/lib/notification-sound";
import { ensurePushSubscription } from "@/lib/pwa";

type Options = {
  selectedContactId?: number;
  onOpenContact: (contactId: number) => void;
  onOpenInternalConversation?: (conversationId: string) => void;
};

export function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

export function useNotifications({ selectedContactId, onOpenContact, onOpenInternalConversation }: Options) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(readNotificationPermission);

  // Os listeners do socket são registrados uma vez; os valores atuais ficam em refs.
  const selectedContactIdRef = useRef(selectedContactId);
  const onOpenContactRef = useRef(onOpenContact);
  const onOpenInternalConversationRef = useRef(onOpenInternalConversation);
  const notificationsRef = useRef(notifications);
  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
    onOpenContactRef.current = onOpenContact;
    onOpenInternalConversationRef.current = onOpenInternalConversation;
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
    setNotifications((current) => {
      const item = current.find((notification) => notification.id === id);
      if (!item || item.readAt) return current;
      setUnreadCount((count) => Math.max(0, count - 1));
      return current.map((notification) => notification.id === id
        ? { ...notification, readAt: new Date().toISOString() }
        : notification);
    });
    void markNotificationRead(id).catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    function handleCreated(notification: AppNotification) {
      if (notification.contactId && notification.contactId === selectedContactIdRef.current) {
        void markNotificationRead(notification.id).catch((error) => console.error(error));
        return;
      }
      setNotifications((current) => [notification, ...current].slice(0, 50));
      setUnreadCount((current) => current + 1);
      const isAppInBackground = document.visibilityState !== "visible" || !document.hasFocus();
      if (isAppInBackground && isNotificationSoundEnabled()) playNotificationSound();

      if (isAppInBackground && "Notification" in window && window.Notification.permission === "granted") {
        const desktopNotification = new window.Notification(notification.title, {
          body: notification.body,
          tag: `cotrimbot-${notification.id}`,
          icon: "/favicon.ico",
        });
        desktopNotification.onclick = () => {
          window.focus();
          desktopNotification.close();
          if (notification.contactId) onOpenContactRef.current(notification.contactId);
          if (notification.internalConversationId) onOpenInternalConversationRef.current?.(notification.internalConversationId);
          markRead(notification.id);
        };
      }
    }

    socket.on("notification_created", handleCreated);
    function handleNotificationsRead(data: { ids?: unknown }) {
      const ids = new Set(Array.isArray(data?.ids) ? data.ids.filter((id): id is number => typeof id === "number") : []);
      if (!ids.size) return;
      setNotifications((current) => {
        const newlyReadCount = current.filter((item) => ids.has(item.id) && !item.readAt).length;
        if (newlyReadCount) setUnreadCount((count) => Math.max(0, count - newlyReadCount));
        return current.map((item) => ids.has(item.id) ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item);
      });
    }
    function handleAllNotificationsRead() {
      setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }));
      setUnreadCount(0);
    }
    socket.on("notifications_read", handleNotificationsRead);
    socket.on("notifications_read_all", handleAllNotificationsRead);
    return () => {
      socket.off("notification_created", handleCreated);
      socket.off("notifications_read", handleNotificationsRead);
      socket.off("notifications_read_all", handleAllNotificationsRead);
    };
  }, [markRead]);

  // Cliques em notificações push (service worker) com o app já aberto abrem a conversa.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function handleMessage(event: MessageEvent) {
      const data = event.data as { type?: string; notificationId?: unknown; contactId?: unknown; internalConversationId?: unknown } | null;
      if (data?.type !== "cotrimbot:notification-click") return;
      if (typeof data.contactId === "number") onOpenContactRef.current(data.contactId);
      if (typeof data.internalConversationId === "string") onOpenInternalConversationRef.current?.(data.internalConversationId);
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

  const markContactRead = useCallback((contactId: number) => {
    const readAt = new Date().toISOString();
    setNotifications((current) => {
      let count = 0;
      const next = current.map((item) => {
        if (item.contactId !== contactId || item.readAt) return item;
        count += 1;
        return { ...item, readAt };
      });
      if (count) setUnreadCount((currentCount) => Math.max(0, currentCount - count));
      return next;
    });
    void markContactNotificationsRead(contactId).catch((error) => console.error(error));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    void clearNotificationsRequest().catch((error) => console.error(error));
  }, []);

  return { notifications, unreadCount, permission, requestPermission, markRead, markContactRead, markAllRead, clearAll };
}
