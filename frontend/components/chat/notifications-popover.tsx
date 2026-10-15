"use client";

import { Popover } from "@base-ui/react/popover";
import { motion, useReducedMotion } from "framer-motion";
import { AtSign, Bell, MessageSquare, Trash2, UserRoundPlus } from "lucide-react";
import type { AppNotification } from "@/lib/notification-api";

type NotificationsPopoverProps = {
  notifications: AppNotification[];
  unreadCount: number;
  permission: NotificationPermission | "unsupported";
  onRequestPermission: () => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
};

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

export function NotificationsPopover({
  notifications,
  unreadCount,
  permission,
  onRequestPermission,
  onOpenNotification,
  onMarkAllRead,
  onClear,
}: NotificationsPopoverProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={unreadCount ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
        className="group relative flex size-10 items-center justify-center rounded-full bg-zinc-950 lg:size-8 text-zinc-500 transition-[background-color,color,transform] hover:bg-zinc-800 hover:text-zinc-100 focus-visible:text-zinc-100 active:scale-95"
      >
        <Bell aria-hidden="true" className="size-[18px] opacity-30 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-zinc-600/80 px-1 text-[10px] font-semibold leading-4 text-zinc-200 opacity-60 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={10} className="z-50">
          <Popover.Popup className="outline-none">
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.965, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 430, damping: 32, mass: 0.72 }}
              style={{ transformOrigin: "top left" }}
              className="flex max-h-[min(500px,72dvh)] w-[350px] max-w-[92vw] flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#111113]/96 p-2 text-white shadow-[0_24px_70px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl"
            >
            <header className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div>
                <Popover.Title className="text-[15px] font-semibold tracking-[-0.01em]">Notificações</Popover.Title>
                {unreadCount > 0 && <p className="mt-0.5 text-[10px] text-zinc-500">{unreadCount} {unreadCount === 1 ? "nova" : "novas"}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={!unreadCount}
                  className="rounded-full px-2.5 py-1.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-default disabled:text-zinc-700 disabled:hover:bg-transparent"
                >
                  Marcar lidas
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={!notifications.length}
                  aria-label="Limpar notificações"
                  title="Limpar notificações"
                  className="flex size-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-default disabled:text-zinc-700 disabled:hover:bg-transparent"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            </header>

            {permission === "default" && (
              <div className="mx-1 mb-1 flex items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2.5 text-[11px] text-zinc-400">
                <span>Ative os avisos do sistema.</span>
                <button type="button" onClick={onRequestPermission} className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 font-medium text-zinc-950 transition-colors hover:bg-white">
                  Ativar
                </button>
              </div>
            )}
            {permission === "denied" && (
              <p className="mx-1 mb-1 rounded-xl bg-amber-400/[0.06] px-3 py-2.5 text-[11px] text-amber-200/80">
                As notificações do sistema estão bloqueadas no navegador.
              </p>
            )}

            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-0.5 pb-0.5">
              {notifications.length === 0 ? (
                <li className="px-4 py-12 text-center text-xs text-zinc-600">Tudo tranquilo por aqui</li>
              ) : notifications.map((notification) => {
                const Icon = notification.type === "CONVERSATION_ASSIGNED"
                  ? UserRoundPlus
                  : notification.type === "MENTION" || notification.type === "PRIVATE_MENTION" || notification.type === "INTERNAL_MENTION" ? AtSign : MessageSquare;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => onOpenNotification(notification)}
                      className="group/item flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.045] focus-visible:bg-white/[0.055] focus-visible:outline-none"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-zinc-500 transition-colors group-hover/item:text-zinc-300">
                        <Icon aria-hidden="true" className="size-[15px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[13px] ${notification.readAt ? "text-zinc-400" : "font-medium text-zinc-100"}`}>{notification.title}</span>
                          <span className="shrink-0 text-[10px] text-zinc-600">{formatRelativeTime(notification.createdAt)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-zinc-500">{notification.body}</span>
                      </span>
                      {!notification.readAt && <span aria-label="Não lida" className="mt-2 size-1.5 shrink-0 rounded-full bg-zinc-400" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            </motion.div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
