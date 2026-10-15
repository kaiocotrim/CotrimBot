"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

function Skeleton({ className }: { className: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.span
    aria-hidden="true"
    className={`block bg-white/[0.08] ${className}`}
    animate={reduceMotion ? undefined : { opacity: [0.38, 0.82, 0.38] }}
    transition={reduceMotion ? undefined : { duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
  />;
}

export function InternalChatSkeleton({ status = "Carregando chat interno...", actions }: { status?: string; actions?: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return <motion.main
    aria-busy="true"
    initial={reduceMotion ? false : { opacity: 0, scale: 0.995 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
    transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    className="flex h-dvh overflow-hidden bg-zinc-950 text-white"
  >
    <div className="hidden w-[60px] shrink-0 border-r border-white/[0.08] bg-[#1a1a1a] px-2 py-3 lg:block">
      <Skeleton className="size-11 rounded-xl" />
    </div>

    <aside className="w-full shrink-0 border-r border-white/[0.08] bg-[#09090b] px-4 py-5 lg:w-[320px]">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-28 rounded-md" />
        <Skeleton className="hidden size-8 rounded-full lg:block" />
      </div>
      <Skeleton className="mt-4 h-9 w-full rounded-full" />
      <div className="mt-5 space-y-2">
        {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl px-1 py-2">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className={`h-3.5 rounded ${item % 2 ? "w-2/3" : "w-1/2"}`} />
            <Skeleton className="h-2.5 w-4/5 rounded" />
          </span>
        </div>)}
      </div>
      <div className="mt-6 text-center lg:hidden">
        <p role="status" className="text-sm text-zinc-400">{status}</p>
        {actions && <div className="mt-3">{actions}</div>}
      </div>
    </aside>

    <section className="relative hidden min-w-0 flex-1 flex-col bg-zinc-950 lg:flex">
      <header className="flex h-16 items-center gap-3 border-b border-white/[0.04] px-5">
        <Skeleton className="size-10 rounded-full" />
        <span className="space-y-2"><Skeleton className="h-3.5 w-32 rounded" /><Skeleton className="h-2.5 w-20 rounded" /></span>
      </header>
      <div className="flex flex-1 flex-col justify-end gap-3 px-8 pb-28">
        <Skeleton className="h-14 w-[42%] rounded-3xl" />
        <Skeleton className="ml-auto h-12 w-[34%] rounded-3xl" />
        <Skeleton className="h-20 w-[48%] rounded-3xl" />
        <Skeleton className="ml-auto h-14 w-[38%] rounded-3xl" />
      </div>
      <div className="absolute inset-x-5 bottom-5 flex items-center gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.035] p-3">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 flex-1 rounded" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-white/[0.08] bg-zinc-950/80 px-4 py-2 text-center shadow-xl backdrop-blur-sm">
          <p role="status" className="text-xs text-zinc-400">{status}</p>
          {actions && <div className="mt-2">{actions}</div>}
        </div>
      </div>
    </section>
  </motion.main>;
}
