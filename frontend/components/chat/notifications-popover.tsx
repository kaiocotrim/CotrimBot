"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell, MessageSquare, Trash2, UserRoundPlus } from "lucide-react";
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
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={unreadCount ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
        className="relative flex size-8 items-center justify-center rounded-full bg-zinc-950 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
      >
        <Bell aria-hidden="true" className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold leading-4 text-zinc-950">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
          <Popover.Popup className="flex max-h-[min(480px,70dvh)] w-[340px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 text-white shadow-2xl outline-none">
            <header className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3">
              <Popover.Title className="text-sm font-semibold">Notificações</Popover.Title>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={!unreadCount}
                  className="rounded-md px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-default disabled:text-zinc-600 disabled:hover:bg-transparent"
                >
                  Marcar lidas
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={!notifications.length}
                  aria-label="Limpar notificações"
                  title="Limpar notificações"
                  className="flex size-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200 disabled:cursor-default disabled:text-zinc-700 disabled:hover:bg-transparent"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            </header>

            {permission === "default" && (
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs text-zinc-300">
                <span>Receba avisos no sistema operacional.</span>
                <button type="button" onClick={onRequestPermission} className="shrink-0 rounded-md bg-white px-2.5 py-1 font-medium text-zinc-950 hover:bg-zinc-200">
                  Ativar
                </button>
              </div>
            )}
            {permission === "denied" && (
              <p className="border-b border-white/[0.08] px-4 py-2.5 text-xs text-amber-300">
                As notificações do sistema estão bloqueadas no navegador.
              </p>
            )}

            <ul className="min-h-0 flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4 py-10 text-center text-[13px] text-zinc-500">Nenhuma notificação por aqui</li>
              ) : notifications.map((notification) => {
                const Icon = notification.type === "CONVERSATION_ASSIGNED" ? UserRoundPlus : MessageSquare;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => onOpenNotification(notification)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-300">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[13px] ${notification.readAt ? "text-zinc-300" : "font-semibold text-white"}`}>{notification.title}</span>
                          <span className="shrink-0 text-[11px] text-zinc-500">{formatRelativeTime(notification.createdAt)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-400">{notification.body}</span>
                      </span>
                      {!notification.readAt && <span aria-label="Não lida" className="mt-2 size-2 shrink-0 rounded-full bg-emerald-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
