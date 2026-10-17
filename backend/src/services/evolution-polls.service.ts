import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.js";

async function request(path: string, body?: unknown) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) throw new Error("Integração com o WhatsApp não configurada.");
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/${path}/${encodeURIComponent(instance)}`, {
    method: "POST", headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 404 && path === "message/sendPollVote") {
      throw new Error("A integração do WhatsApp precisa da atualização de enquetes para enviar seu voto.");
    }
    throw new Error("Não foi possível acessar a enquete no WhatsApp. Tente novamente.");
  }
  return response.json();
}

export async function getWhatsAppPollIdentity(): Promise<string[]> {
  const data = await request("baileys/getAuthState");
  return [...new Set([data?.me?.id, data?.me?.lid].filter((jid): jid is string => typeof jid === "string").map(normalizeWhatsAppJid))];
}

export async function sendWhatsAppPollVote(number: string, messageId: string, optionIndexes: number[]): Promise<{ voterId: string; voterName: string | null; timestamp: number }> {
  const result = await request("message/sendPollVote", { number, messageId, optionIndexes });
  if (typeof result?.voterId !== "string" || !Number.isFinite(result?.timestamp)) throw new Error("O WhatsApp não confirmou seu voto.");
  return { voterId: normalizeWhatsAppJid(result.voterId), voterName: typeof result.voterName === "string" ? result.voterName : null, timestamp: result.timestamp };
}

export async function getWhatsAppPollVotes(number: string) {
  const remoteJid = number.includes("@") ? number : `${number}@s.whatsapp.net`;
  const records: Record<string, any>[] = [];
  for (let page = 1; page <= 10; page++) {
    const result = await request("chat/findMessages", { where: { key: { remoteJid }, messageType: "pollUpdateMessage" }, offset: 100, page });
    const batch = result?.messages?.records;
    if (!Array.isArray(batch)) throw new Error("Não foi possível consultar os votos do WhatsApp.");
    records.push(...batch);
    if (page >= Number(result.messages.pages) || batch.length < 100) break;
  }
  return records;
}
