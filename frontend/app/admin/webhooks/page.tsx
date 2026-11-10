"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OrganizationWebhooks } from "@/components/admin/organization-webhooks";
import { useSession } from "@/lib/auth-client";

export default function AdminWebhooksPage() {
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
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">Empresa</Link>
            <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          </div>
          <Link href="/" className="text-sm text-zinc-400 transition-colors hover:text-zinc-100">Voltar para o chat</Link>
        </div>
        <OrganizationWebhooks activeOrganizationId={session.session.activeOrganizationId} />
      </div>
    </main>
  );
}
