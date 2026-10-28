"use client";

import { useEffect, useState } from "react";
import { CONTACT_AVATAR_FAILED, CONTACT_AVATAR_UPDATED, type ContactAvatarEvent } from "@/lib/contact-avatar-events";
import type { Contact } from "@/types/chat";

// Exibe a foto do WhatsApp ou a inicial quando não há imagem disponível.
export function Avatar({ contact, className = "h-10 w-10" }: { contact: Pick<Contact, "name" | "profilePictureUrl"> & Partial<Pick<Contact, "id">>; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photoUrl = contact.profilePictureUrl?.trim();
  const initial = contact.name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    function onUpdated(event: Event) {
      if ((event as ContactAvatarEvent).detail.contactId === contact.id) setFailedUrl(null);
    }
    window.addEventListener(CONTACT_AVATAR_UPDATED, onUpdated);
    return () => window.removeEventListener(CONTACT_AVATAR_UPDATED, onUpdated);
  }, [contact.id]);

  if (photoUrl && photoUrl !== failedUrl) {
    return (
      // A URL é externa e dinâmica, por isso não passa pelo otimizador do Next.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={contact.name}
        onError={() => {
          setFailedUrl(photoUrl);
          if (contact.id !== undefined) {
            window.dispatchEvent(new CustomEvent(CONTACT_AVATAR_FAILED, { detail: { contactId: contact.id } }));
          }
        }}
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
