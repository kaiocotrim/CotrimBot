type MessageAuthor = {
  name: string;
  image?: string | null;
};

export function OutgoingMessageAvatar({ user }: { user: MessageAuthor | null }) {
  if (!user) return null;

  const label = `Enviada por ${user.name}`;
  if (user.image) {
    return (
      // A foto é dinâmica e pode ser um data URL salvo pelo próprio usuário.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.image}
        alt={label}
        title={label}
        className="size-9 shrink-0 rounded-full border border-white/10 object-cover shadow-sm"
      />
    );
  }

  return (
    <span
      aria-label={label}
      title={label}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-700 text-xs font-semibold text-zinc-100 shadow-sm"
    >
      {user.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
