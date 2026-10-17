import { createHmac, randomBytes } from "node:crypto";
import { normalizeWhatsAppJid } from "./whatsapp-jid.js";

export type PresenceStatus = "unavailable" | "available" | "composing" | "recording" | "paused";
const statuses = new Set<PresenceStatus>(["unavailable", "available", "composing", "recording", "paused"]);
const debugSalt = randomBytes(32);
let debugWindow = 0;
let debugCount = 0;

type PresenceDiagnostic = {
  event?: "presence.update" | "other";
  reason?: "invalid_payload" | "self" | "group" | "missing_status" | "missing_jid";
  presence?: PresenceStatus;
  identifiers?: { kind: "phone" | "lid"; ref: string }[];
  contactId?: number;
  count?: number;
};

// Opt-in e limitado a 120 linhas/minuto. Nunca registra payloads ou credenciais.
export function presenceDebug(stage: "webhook_received" | "received" | "ignored" | "contact_not_found" | "ambiguous_contact" | "emitted" | "subscription_attempt" | "subscription_ok" | "subscription_failed", details: PresenceDiagnostic = {}) {
  if (process.env.PRESENCE_DEBUG !== "true") return;
  const now = Date.now();
  if (now - debugWindow >= 60_000) { debugWindow = now; debugCount = 0; }
  if (debugCount++ >= 120) return;
  console.info("[whatsapp-presence]", JSON.stringify({ stage, ...details }));
}

export function presenceIdentifiers(jids: string[]) {
  return jids.map((jid) => ({
    kind: jid.endsWith("@lid") ? "lid" as const : "phone" as const,
    ref: createHmac("sha256", debugSalt).update(jid).digest("hex").slice(0, 12),
  }));
}

export function isPresenceEvent(value: unknown) {
  return typeof value === "string" && value.toLowerCase().replace(/[_-]/g, ".") === "presence.update";
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function status(value: unknown): PresenceStatus | null {
  if (!record(value)) return null;
  for (const raw of [value.presence, value.lastKnownPresence, value.status]) {
    if (typeof raw !== "string") continue;
    const normalized = raw.trim().toLowerCase() as PresenceStatus;
    if (statuses.has(normalized)) return normalized;
  }
  return null;
}

function directJids(values: unknown[]) {
  return [...new Set(values.filter((jid): jid is string => typeof jid === "string")
    .map(normalizeWhatsAppJid).filter((jid) => /^\d+@(s\.whatsapp\.net|lid)$/.test(jid)))];
}

type ParsedPresence = { presence: PresenceStatus; jids: string[] };
type ParseResult = { updates: ParsedPresence[]; ignored: NonNullable<PresenceDiagnostic["reason"]>[] };

// Mantém PN e LID como aliases, sem transformar o número de um LID em telefone.
export function parsePresenceUpdate(value: unknown): ParseResult {
  const ignored: ParseResult["ignored"] = [];
  if (!record(value)) return { updates: [], ignored: ["invalid_payload"] };
  const key = record(value.key) ? value.key : {};
  if (value.fromMe === true || key.fromMe === true) return { updates: [], ignored: ["self"] };
  const candidates = [value.id, value.remoteJid, value.remoteJidAlt, value.jid, key.remoteJid, key.remoteJidAlt];
  if (candidates.some((jid) => typeof jid === "string" && jid.trim().endsWith("@g.us"))) return { updates: [], ignored: ["group"] };
  const aliases = directJids(candidates);
  const entries = record(value.presences) ? Object.entries(value.presences) : [];
  const directStatus = status(value);
  if (directStatus) {
    const jids = directJids([...aliases, ...(entries.length === 1 ? [entries[0]![0]] : [])]);
    return jids.length ? { updates: [{ presence: directStatus, jids }], ignored } : { updates: [], ignored: ["missing_jid"] };
  }
  if (!entries.length) return { updates: [], ignored: ["missing_status"] };
  const updates: ParsedPresence[] = [];
  for (const [jid, entry] of entries) {
    const presence = status(entry);
    if (!presence) { ignored.push("missing_status"); continue; }
    // Um mapa com várias pessoas deve manter status e identidade separados.
    const jids = directJids([jid, ...(entries.length === 1 ? aliases : [])]);
    if (!jids.length) { ignored.push("missing_jid"); continue; }
    updates.push({ presence, jids });
  }
  return { updates, ignored };
}
