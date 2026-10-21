import type { BotFlow } from "./bot-flow.js";

export const BOT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function botImageMime(data: Buffer): string | null {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 4 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function botImageIds(flow: BotFlow): string[] {
  return [...new Set(flow.menus.flatMap(menu => [menu.imageId, ...menu.options.map(option => option.imageId)]).filter((id): id is string => Boolean(id)))];
}
