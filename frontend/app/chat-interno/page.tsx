"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { InternalChatWorkspace } from "@/components/chat/internal-chat-workspace";
import { useSession } from "@/lib/auth-client";

export default function InternalChatPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, router, session]);

  if (isPending || !session) return <main className="flex h-dvh items-center justify-center bg-zinc-950 text-sm text-zinc-500">Carregando...</main>;
  return <InternalChatWorkspace />;
}
