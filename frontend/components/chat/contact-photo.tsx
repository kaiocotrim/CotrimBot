"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/chat/avatar";
import type { Contact } from "@/types/chat";

export function ContactPhoto({ contact }: { contact: Contact }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const photoUrl = contact.profilePictureUrl;

  if (!photoUrl) return <Avatar contact={contact} className="size-28" />;

  function openPhoto() {
    setImageFailed(false);
    setOpen(true);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openPhoto}
        aria-label={`Ampliar foto de ${contact.name}`}
        aria-haspopup="dialog"
        className="shrink-0 cursor-zoom-in rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
      >
        <Avatar contact={contact} className="size-28" />
      </button>

      <dialog
        ref={dialogRef}
        aria-label={`Foto de ${contact.name}`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col items-center justify-center border-0 bg-black p-6 text-white outline-none backdrop:bg-black open:flex"
      >
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Fechar foto"
          className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70"
        >
          <X className="size-6" aria-hidden="true" />
        </button>

        {open && (imageFailed ? (
          <p role="alert" className="max-w-sm text-center text-sm text-zinc-300">
            Não foi possível carregar a foto deste contato.
          </p>
        ) : (
          // A foto vem de uma URL externa e dinâmica do WhatsApp.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`Foto de ${contact.name}`}
            onError={() => setImageFailed(true)}
            className="block max-h-[calc(100dvh-8rem)] max-w-full object-contain"
          />
        ))}
      </dialog>
    </>
  );
}
