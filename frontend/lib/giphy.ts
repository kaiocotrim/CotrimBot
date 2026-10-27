export type GiphyGif = { id: string; title: string; previewUrl: string; gifUrl: string; mp4Url: string };
export type GifFile = File & { gifPlayback?: true };
const KEY_STORAGE = "cotrimbot:giphy-api-key";

export function readGiphyKey() {
  try { return localStorage.getItem(KEY_STORAGE)?.trim() || process.env.NEXT_PUBLIC_GIPHY_API_KEY || ""; }
  catch { return process.env.NEXT_PUBLIC_GIPHY_API_KEY || ""; }
}
export function saveGiphyKey(key: string) { try { localStorage.setItem(KEY_STORAGE, key.trim()); } catch { /* A conexão continua disponível nesta sessão. */ } }

function mediaUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "giphy.com" || url.hostname.endsWith(".giphy.com")) ? url.href : ""; }
  catch { return ""; }
}

export async function searchGifs(key: string, query = "", offset = 0, signal?: AbortSignal) {
  const url = new URL(`https://api.giphy.com/v1/gifs/${query.trim() ? "search" : "trending"}`);
  url.search = new URLSearchParams({ api_key: key.trim(), limit: "24", offset: String(offset), rating: "g", lang: "pt", ...(query.trim() ? { q: query.trim().slice(0, 50) } : {}) }).toString();
  const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(10000), credentials: "omit" });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Chave GIPHY inválida. Confira a chave da sua aplicação." : response.status === 429 ? "Limite de buscas do GIPHY atingido. Tente novamente mais tarde." : "Não foi possível carregar os GIFs. Tente novamente.");
  const result = await response.json() as { data?: Array<{ id?: string; title?: string; images?: Record<string, { url?: string; mp4?: string }> }>; pagination?: { offset?: number; count?: number; total_count?: number } };
  if (!Array.isArray(result.data)) throw new Error("O GIPHY não retornou uma lista válida de GIFs.");
  const gifs = result.data.flatMap((item): GiphyGif[] => {
    const previewUrl = mediaUrl(item.images?.fixed_width?.url ?? item.images?.fixed_height?.url ?? item.images?.original?.url);
    const gifUrl = mediaUrl(item.images?.original?.url);
    const mp4Url = mediaUrl(item.images?.original?.mp4 ?? item.images?.fixed_height?.mp4 ?? item.images?.downsized_small?.mp4);
    return item.id && /^[\w-]+$/.test(item.id) && previewUrl && gifUrl && mp4Url ? [{ id: item.id, title: item.title || "GIF", previewUrl, gifUrl, mp4Url }] : [];
  });
  const nextOffset = offset + result.data.length;
  return { gifs, nextOffset, hasMore: result.data.length > 0 && nextOffset < (result.pagination?.total_count ?? nextOffset) };
}

export async function downloadGif(gif: GiphyGif, format: "mp4" | "gif" = "mp4"): Promise<GifFile> {
  const url = mediaUrl(format === "mp4" ? gif.mp4Url : gif.gifUrl);
  if (!url) throw new Error("Endereço do GIF inválido.");
  const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Não foi possível preparar este GIF. Escolha outro ou tente novamente.");
  const maxBytes = 16 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("Este GIF é muito grande. Escolha um GIF menor.");
  const reader = response.body?.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error("Este GIF é muito grande. Escolha um GIF menor."); }
        chunks.push(new Uint8Array(part.value));
      }
    } finally { reader.releaseLock(); }
  }
  const blob = reader ? new Blob(chunks) : await response.blob();
  if (!blob.size || blob.size > maxBytes) throw new Error("O GIF está vazio ou excede 16 MB.");
  const file: GifFile = new File([blob], `gif-${gif.id}.${format}`, { type: format === "mp4" ? "video/mp4" : "image/gif" });
  if (format === "mp4") file.gifPlayback = true;
  return file;
}
