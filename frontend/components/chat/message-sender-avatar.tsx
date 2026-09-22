"use client";

import { useEffect, useState } from "react";
import type { Message } from "@/types/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export function MessageSenderAvatar({ message }: { message: Message }) {
  const [pictureUrl, setPictureUrl] = useState(message.senderProfilePictureUrl);

  useEffect(() => {
    if (pictureUrl || !message.senderPhone) return;
    let active = true;
    fetch(`${API_URL}/messages/${message.id}/sender-avatar`)
      .then((response) => response.ok ? response.json() as Promise<{ profilePictureUrl: string | null }> : null)
      .then((result) => {
        if (active && result?.profilePictureUrl) setPictureUrl(result.profilePictureUrl);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [message.id, message.senderPhone, pictureUrl]);

  const initial = (message.senderName ?? message.senderPhone ?? "?").charAt(0).toUpperCase();

  if (pictureUrl) {
    return (
      // URL dinâmica fornecida pelo WhatsApp; não passa pelo otimizador do Next.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pictureUrl}
        alt={message.senderName ? `Foto de ${message.senderName}` : "Foto do participante"}
        className="size-10 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span aria-label={message.senderName ?? "Participante do grupo"} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold text-zinc-200">
      {initial}
    </span>
  );
}
