"use client";

import { useState } from "react";
import type { Contact } from "@/types/chat";

// Exibe a foto do WhatsApp ou a inicial quando não há imagem disponível.
export function Avatar({ contact, className = "h-10 w-10" }: { contact: Pick<Contact, "name" | "profilePictureUrl">; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photoUrl = contact.profilePictureUrl?.trim();
  const initial = contact.name.trim().charAt(0).toUpperCase() || "?";

  if (photoUrl && photoUrl !== failedUrl) {
    return (
      // A URL é externa e dinâmica, por isso não passa pelo otimizador do Next.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={contact.name}
        onError={() => setFailedUrl(photoUrl)}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div role="img" aria-label={contact.name} className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-zinc-700 font-semibold`}>
      {initial}
    </div>
  );
}
