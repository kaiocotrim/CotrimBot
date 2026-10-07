"use client";

import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
    return (
      <main className="flex min-h-dvh items-center justify-center bg-black text-white">
        <p className="text-sm text-zinc-500">Carregando empresa...</p>
      </main>
    );
  }

  return (
    <motion.main
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
      className="min-h-dvh bg-black text-white"
    >
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div>
            <h1 className="text-base font-semibold text-zinc-100">Empresa</h1>
            <p className="hidden text-xs text-zinc-600 sm:block">Membros, grupos e permissões</p>
          </div>
          <Link href="/" className="flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-white">
            <ArrowLeft size={15} /> Voltar para o chat
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <TeamManagement
          currentUserId={session.user.id}
          currentUserName={session.user.name}
          currentUserEmail={session.user.email}
          canCreateCompany={session.user.role === "admin"}
        />
      </div>
    </motion.main>
  );
}
