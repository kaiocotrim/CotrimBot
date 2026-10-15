"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { InternalChatSkeleton } from "@/components/chat/internal-chat-skeleton";
import { InternalChatWorkspace } from "@/components/chat/internal-chat-workspace";
import { useSession } from "@/lib/auth-client";
import { getInternalChatIdentity, setInternalChatIdentity } from "@/lib/internal-chat-api";

export default function InternalChatPage() {
  const { data: session, isPending } = useSession();
  const [sessionCheckSlow, setSessionCheckSlow] = useState(false);
  const sessionIdentity = useMemo(() => session ? {
    userId: session.user.id,
    activeOrganizationId: (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
  } : null, [session]);
  const identity = sessionIdentity ?? (isPending ? getInternalChatIdentity() : null);

  useEffect(() => {
    if (!isPending) return;
    const timeout = window.setTimeout(() => setSessionCheckSlow(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [isPending]);

  useEffect(() => {
    if (sessionIdentity) setInternalChatIdentity(sessionIdentity);
    else if (!isPending) {
      setInternalChatIdentity(null);
      window.location.replace("/login");
    }
  }, [isPending, sessionIdentity]);

  if (isPending && !identity) return <AnimatePresence mode="wait">
    <InternalChatSkeleton
      key="session-loading"
      status={sessionCheckSlow ? "Não foi possível confirmar sua sessão." : "Carregando chat interno..."}
      actions={sessionCheckSlow ? <div className="flex items-center justify-center gap-4 text-xs"><button type="button" onClick={() => window.location.reload()} className="text-zinc-100 underline underline-offset-4">Tentar novamente</button><Link href="/login" className="text-zinc-300 underline underline-offset-4">Ir para o login</Link></div> : undefined}
    />
  </AnimatePresence>;

  if (!identity) return <InternalChatSkeleton status="Redirecionando para o login..." />;

  return <motion.div
    initial={false}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0 }}
    className="h-dvh overflow-hidden bg-zinc-950"
  >
    <InternalChatWorkspace activeOrganizationId={identity.activeOrganizationId} currentUserId={identity.userId} />
  </motion.div>;
}
