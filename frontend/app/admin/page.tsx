"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TeamManagement } from "@/components/admin/team-management";
import { useSession } from "@/lib/auth-client";

export default function AdminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
    else if (!isPending && !isAdmin) router.replace("/");
  }, [isAdmin, isPending, router, session]);

  if (isPending || !session || !isAdmin) {
    return (
      <main className="flex h-dvh items-center justify-center bg-zinc-950 text-white">
        <p className="text-sm text-zinc-400">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
          <Link href="/" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">Voltar para o chat</Link>
        </div>
        <TeamManagement currentUserId={session.user.id} currentUserName={session.user.name} currentUserEmail={session.user.email} canCreateCompany />
      </div>
    </main>
  );
}
