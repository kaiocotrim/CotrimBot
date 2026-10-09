"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, CalendarDays, ContactRound, MessagesSquare, UserRound, UserRoundCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountSettings } from "@/components/chat/account-settings";

export type ChatRailSection = "conversations" | "contacts" | "groups" | "mine" | "archived";

type RailUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
};

const sections = [
  { id: "conversations", label: "Conversas", icon: MessagesSquare },
  { id: "contacts", label: "Contatos", icon: ContactRound },
  { id: "groups", label: "Grupos", icon: UsersRound },
  { id: "mine", label: "Minhas conversas", icon: UserRoundCheck },
  { id: "archived", label: "Arquivadas", icon: Archive },
] as const;

export function ChatNavigationRail({
  activeSection,
  unreadCount,
  user,
  onNavigate,
  onOpenSettings,
}: {
  activeSection: ChatRailSection;
  unreadCount: number;
  user?: RailUser | null;
  onNavigate: (section: ChatRailSection) => void;
  onOpenSettings: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [calendarNoticeVisible, setCalendarNoticeVisible] = useState(false);

  useEffect(() => {
    if (!calendarNoticeVisible) return;
    const timeout = window.setTimeout(() => setCalendarNoticeVisible(false), 3_000);
    return () => window.clearTimeout(timeout);
  }, [calendarNoticeVisible]);

  return (
    <nav aria-label="Navegação principal" className="flex h-full w-[60px] shrink-0 flex-col items-center border-r border-white/[0.08] bg-[#1a1a1a] px-2 py-3 text-zinc-400">
      <div className="flex w-full flex-col items-center gap-1">
        {sections.map(({ id, label, icon: Icon }) => (
          <motion.button
            key={id}
            type="button"
            aria-label={id === "conversations" && unreadCount > 0 ? `${label}, ${unreadCount} mensagens não lidas` : label}
            aria-current={activeSection === id ? "page" : undefined}
            title={label}
            onClick={() => onNavigate(id)}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70 ${activeSection === id ? "text-zinc-50" : "hover:bg-white/[0.07] hover:text-zinc-100"}`}
          >
            {activeSection === id && (
              <motion.span
                layoutId="chat-rail-active"
                aria-hidden="true"
                className="absolute inset-0 rounded-xl bg-white/[0.12]"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 38 }}
              />
            )}
            <Icon aria-hidden="true" className="relative size-5" strokeWidth={1.8} />
            {id === "conversations" && unreadCount > 0 && (
              <span aria-hidden="true" className="absolute -top-0.5 -right-1 flex size-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-semibold leading-none text-zinc-950">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </motion.button>
        ))}
        <div className="relative">
          <motion.button
            type="button"
            aria-label="Calendário"
            title="Calendário"
            onClick={() => setCalendarNoticeVisible(true)}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            className="flex size-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70"
          >
            <CalendarDays aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </motion.button>
          <AnimatePresence>
            {calendarNoticeVisible && (
              <motion.span
                role="status"
                initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
                className="pointer-events-none absolute top-1 left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-xl border border-white/[0.12] bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-100 shadow-xl"
              >
                Funcionalidade em breve
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {user && (
        <div className="mt-auto pb-1">
          <AccountSettings user={user} onOpen={onOpenSettings}>
            <span aria-hidden="true" className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-zinc-700 text-zinc-200">
              {user.image && user.image !== failedAvatarUrl ? (
                // A foto da conta pode vir de um provedor externo.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="size-full object-cover" onError={() => setFailedAvatarUrl(user.image ?? null)} />
              ) : <UserRound className="size-4" strokeWidth={1.8} />}
            </span>
          </AccountSettings>
        </div>
      )}
    </nav>
  );
}
