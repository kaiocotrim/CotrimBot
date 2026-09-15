import type { Contact } from "@/types/chat";

// Exibe a foto do WhatsApp ou a inicial quando não há imagem disponível.
export function Avatar({ contact }: { contact: Contact }) {
  if (contact.profilePictureUrl) {
    return (
      // A URL é externa e dinâmica, por isso não passa pelo otimizador do Next.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={contact.profilePictureUrl}
        alt={contact.name}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 font-semibold">
      {contact.name.charAt(0).toUpperCase()}
    </div>
  );
}
