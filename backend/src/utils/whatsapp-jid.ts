const directUserServers = new Set(["s.whatsapp.net", "lid"]);

/**
 * Baileys pode acrescentar o dispositivo ao usuário do JID, por exemplo
 * `5511999999999:0@s.whatsapp.net`. Esse sufixo não identifica outra pessoa.
 */
export function normalizeWhatsAppJid(value: string): string {
  const jid = value.trim();
  const separatorIndex = jid.lastIndexOf("@");
  if (separatorIndex < 1) return jid;

  const user = jid.slice(0, separatorIndex);
  const server = jid.slice(separatorIndex + 1);
  if (!directUserServers.has(server)) return jid;

  return `${user.replace(/:\d+$/, "")}@${server}`;
}

export function whatsAppJidIdentifier(value: string): string {
  const jid = normalizeWhatsAppJid(value);
  const separatorIndex = jid.lastIndexOf("@");
  if (separatorIndex < 1) return jid.replace(/:\d+$/, "");

  const server = jid.slice(separatorIndex + 1);
  return directUserServers.has(server) ? jid.slice(0, separatorIndex) : jid;
}
