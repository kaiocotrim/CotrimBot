type SystemMessageEvent = {
  kind?: unknown;
  actor?: { id?: unknown; name?: unknown };
  targets?: Array<{ id?: unknown; name?: unknown }>;
};

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "o bot";
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

export function systemMessageLabel(content: string, currentUserId: string) {
  try {
    const event = JSON.parse(content) as SystemMessageEvent;
    const actorName = event.actor?.id === currentUserId
      ? "Você"
      : typeof event.actor?.name === "string" ? event.actor.name : "Alguém";

    if (event.kind === "closed") return `${actorName} finalizou`;
    if (event.kind === "assignment") {
      const targets = Array.isArray(event.targets)
        ? event.targets.map((target) => target.id === currentUserId
          ? "você"
          : typeof target.name === "string" ? target.name : "usuário")
        : [];
      return `${actorName} atribuiu para ${joinNames(targets)}`;
    }
  } catch {
    // Eventos antigos ou desconhecidos continuam legíveis como texto simples.
  }
  return content;
}
