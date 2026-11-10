"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, MessagesSquare, Search } from "lucide-react";
import type { ReactNode } from "react";

function Skeleton({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block bg-white/[0.055] ${className}`} />;
}

export function InternalConversationListSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  const reduceMotion = useReducedMotion();
  const widths = ["w-28", "w-36", "w-24", "w-32", "w-28", "w-24"];

  return <motion.div
    role="status"
    aria-label="Carregando contatos e conversas"
    animate={reduceMotion ? undefined : { opacity: [0.6, 1, 0.6] }}
    transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    className="space-y-1 py-1"
  >
    <span className="sr-only">Carregando contatos e conversas...</span>
    {widths.map((width, index) => <div key={index} aria-hidden="true" className={`flex items-center py-2 ${collapsed ? "justify-center" : "gap-2.5 px-2"}`}>
      <Skeleton className="size-12 shrink-0 rounded-full lg:size-10" />
      {!collapsed && <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className={`h-2.5 max-w-full rounded-full ${width}`} />
          <Skeleton className="h-1.5 w-5 shrink-0 rounded-full opacity-50" />
        </div>
        <Skeleton className={`h-2 rounded-full opacity-50 ${index % 2 ? "w-2/3" : "w-4/5"}`} />
      </div>}
    </div>)}
  </motion.div>;
}

export function InternalChatSkeleton({ status = "Carregando chat interno...", actions }: { status?: string; actions?: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return <motion.main
    aria-busy="true"
    initial={reduceMotion ? false : { opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: reduceMotion ? 0 : 0.18 }}
    className="flex h-dvh overflow-hidden bg-zinc-950 text-white"
  >
    <nav aria-label="Sair do chat interno" className="hidden w-[60px] shrink-0 flex-col items-center border-r border-white/[0.08] bg-[#1a1a1a] px-2 py-3 lg:flex">
      <Link href="/" aria-label="Voltar ao atendimento" className="flex size-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/60">
        <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.8} />
      </Link>
    </nav>

    <aside aria-label="Carregando lista de conversas" className="flex min-h-0 w-full shrink-0 flex-col border-r border-white/[0.08] bg-[#09090b] lg:w-[320px]">
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-5 lg:px-4 lg:pt-4">
        <div className="flex h-9 items-center gap-2 lg:h-8">
          <Link href="/" aria-label="Voltar ao atendimento" className="flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 focus-visible:outline-2 focus-visible:outline-white/60 lg:hidden"><ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.8} /></Link>
          <h1 className="text-[28px] font-normal tracking-tight text-zinc-100 lg:text-lg">Chat interno</h1>
        </div>
        <div aria-hidden="true" className="mt-3 flex h-11 items-center gap-2 rounded-full border border-white/[0.07] px-3 text-zinc-600 lg:h-9">
          <Search className="size-[15px] shrink-0" strokeWidth={1.8} />
          <span className="truncate text-sm lg:text-[13px]">Pesquisar chats e membros</span>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
        <InternalConversationListSkeleton />
      </div>
      <div className="px-5 py-6 text-center lg:hidden">
        <p role="status" className="text-xs text-zinc-500">{status}</p>
        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </aside>

    <section aria-label="Carregando chat interno" className="hidden min-w-0 flex-1 items-center justify-center px-8 lg:flex">
      <div className="flex max-w-sm flex-col items-center text-center">
        <motion.div
          aria-hidden="true"
          animate={reduceMotion ? undefined : { opacity: [0.45, 0.85, 0.45] }}
          transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="mb-5 text-zinc-600"
        >
          <MessagesSquare className="size-8" strokeWidth={1.2} />
        </motion.div>
        <p role="status" className="text-xs font-normal leading-5 text-zinc-500">{status}</p>
        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </section>
  </motion.main>;
}
