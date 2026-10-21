import { timingSafeEqual } from "node:crypto";

export function authenticateBotWebhook(candidate: unknown, secret = process.env.BOT_WEBHOOK_SECRET): boolean {
  if (!secret || typeof candidate !== "string") return false;
  const actual = Buffer.from(candidate), expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
