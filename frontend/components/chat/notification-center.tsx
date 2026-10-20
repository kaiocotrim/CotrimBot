"use client";

import { useEffect, useMemo, useState } from "react";
import { AtSign, Bell, CheckCheck, MessageSquare, Search, Trash2, UserRoundPlus } from "lucide-react";
import type { AppNotification } from "@/lib/notification-api";

type NotificationFilter = "all" | "unread" | "mentions";

function formatRelativeTime(value: string, now: number) {
  const diff = now - new Date(value).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

function isMention(notification: AppNotification) {
  return notification.type === "MENTION" || notification.type === "PRIVATE_MENTION" || notification.type === "INTERNAL_MENTION";
}

export function NotificationCenter({
  notifications,
  unreadCount,
  permission,
  onRequestPermission,
  onOpenNotification,
  onMarkAllRead,
  onClear,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  permission: NotificationPermission | "unsupported";
  onRequestPermission: () => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const visibleNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return notifications.filter((notification) => {
      if (filter === "unread" && notification.readAt) return false;
      if (filter === "mentions" && !isMention(notification)) return false;
      return !normalizedQuery || `${notification.title} ${notification.body}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery);
    });
  }, [filter, notifications, query]);

  return (
    <section aria-label="Central de notificações" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#09090b] text-white">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-base font-normal tracking-tight text-zinc-100">Notificações</h1>
          {unreadCount > 0 && (
            <span className="flex min-w-5 items-center justify-center rounded-full bg-white/[0.09] px-1.5 text-[10px] font-medium leading-5 text-zinc-300">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onMarkAllRead} disabled={!unreadCount} title="Marcar todas como lidas" aria-label="Marcar todas como lidas" className="flex size-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300 disabled:cursor-default disabled:opacity-25">
            <CheckCheck aria-hidden="true" className="size-4" />
          </button>
          <button type="button" onClick={onClear} disabled={!notifications.length} title="Limpar notificações" aria-label="Limpar notificações" className="flex size-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300 disabled:cursor-default disabled:opacity-25">
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-3 px-4 py-3.5">
        <div className="flex gap-1 rounded-xl border border-white/[0.045] bg-white/[0.035] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl" role="tablist" aria-label="Filtros de notificações">
          {([["all", "Geral"], ["unread", "Não lidas"], ["mentions", "@Menções"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${filter === value ? "bg-gradient-to-b from-white/[0.14] to-white/[0.075] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_3px_10px_rgba(0,0,0,0.18)]" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.035] bg-white/[0.03] px-3 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-lg transition focus-within:border-white/[0.09] focus-within:bg-white/[0.055] focus-within:text-zinc-400">
          <Search aria-hidden="true" className="size-3.5" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar" className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600" />
        </label>
        {permission === "default" && (
          <div className="flex max-w-xl items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2 text-xs text-zinc-400">
            <span>Ative também os avisos do sistema.</span>
            <button type="button" onClick={onRequestPermission} className="rounded-full bg-zinc-100 px-3 py-1.5 font-medium text-zinc-950 hover:bg-white">Ativar</button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5">
        {visibleNotifications.length ? (
          <ul className="mx-auto w-full max-w-3xl space-y-1">
            {visibleNotifications.map((notification) => {
              const Icon = notification.type === "CONVERSATION_ASSIGNED" ? UserRoundPlus : isMention(notification) ? AtSign : MessageSquare;
              return (
                <li key={notification.id}>
                  <button type="button" onClick={() => onOpenNotification(notification)} className="group flex w-full items-start gap-3 rounded-2xl border border-white/[0.045] bg-gradient-to-br from-white/[0.055] to-white/[0.022] px-3 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-xl transition hover:border-white/[0.08] hover:from-white/[0.075] hover:to-white/[0.035] focus-visible:border-white/[0.12] focus-visible:outline-none">
                    <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${notification.readAt ? "bg-white/[0.035] text-zinc-600" : "bg-white/[0.08] text-zinc-200"}`}>
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`truncate text-sm ${notification.readAt ? "text-zinc-400" : "font-medium text-zinc-100"}`}>{notification.title}</span>
                        <span className="shrink-0 text-[10px] text-zinc-600">{formatRelativeTime(notification.createdAt, now)}</span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-500">{notification.body}</span>
                    </span>
                    {!notification.readAt && <span aria-label="Não lida" className="mt-3 size-2 shrink-0 rounded-full bg-zinc-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
            <Bell aria-hidden="true" className="size-8 text-zinc-700" />
            <p className="mt-4 text-sm text-zinc-400">{filter === "mentions" ? "Nenhuma menção para você." : filter === "unread" ? "Nenhuma notificação não lida." : "Tudo tranquilo por aqui."}</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-600">Aqui você verá menções, atribuições e outras notificações.</p>
          </div>
        )}
      </div>
    </section>
  );
}
