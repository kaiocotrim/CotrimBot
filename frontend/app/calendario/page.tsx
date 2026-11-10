"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CalendarModal } from "@/components/chat/calendar-modal";
import { useSession } from "@/lib/auth-client";

export default function CalendarPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, router, session]);

  if (isPending || !session) {
    return (
      <main className="flex h-dvh items-center justify-center bg-zinc-950 text-white">
        <p className="text-sm text-zinc-400">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-white">
      <header className="h-14 shrink-0">
        <div className="flex h-full w-full items-center px-3 sm:px-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Voltar"
            title="Voltar"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-[background-color,color,transform] hover:bg-white/[0.07] hover:text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 lg:my-auto lg:h-[min(620px,calc(100dvh-5rem))] lg:flex-none">
        <CalendarModal variant="page" onClose={() => router.push("/")} />
      </div>
    </main>
  );
}
