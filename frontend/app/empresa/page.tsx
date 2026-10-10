"use client";

import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CompanyPageSkeleton } from "@/components/admin/company-skeleton";
import { TeamManagement } from "@/components/admin/team-management";
import { useSession } from "@/lib/auth-client";

export default function CompanyPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, router, session]);

  if (isPending || !session) {
    return <CompanyPageSkeleton />;
  }

  return (
    <main className="min-h-dvh bg-black text-white">
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 bg-black/90 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-[calc(6rem+env(safe-area-inset-top))] max-w-7xl items-center justify-between px-5 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
          <div>
            <h1 className="text-base font-semibold text-zinc-100">Empresa</h1>
            <p className="hidden text-xs text-zinc-600 sm:block">Membros, grupos e permissões</p>
          </div>
          <Link href="/" className="flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-white">
            <ArrowLeft size={15} /> Voltar para o chat
          </Link>
        </div>
      </motion.header>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.38, delay: 0.03, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10"
      >
        <TeamManagement
          currentUserId={session.user.id}
          currentUserName={session.user.name}
          currentUserEmail={session.user.email}
          canCreateCompany={session.user.role === "admin"}
        />
      </motion.div>
    </main>
  );
}
