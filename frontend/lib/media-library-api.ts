const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type MediaLibraryTab = "media" | "documents" | "links";
export type MediaLibraryItem = {
  id: number;
  type: "IMAGE" | "VIDEO" | "DOCUMENT" | "TEXT";
  content: string;
  createdAt: string;
  contactId: number;
  contactName: string;
  senderName: string;
  fileName: string | null;
  mimeType: string | null;
  links: string[];
};
export type MediaLibraryPage = { items: MediaLibraryItem[]; hasMore: boolean; nextCursor: number | null };
export type ContactMediaSummary = { count: number; items: MediaLibraryItem[] };

export async function getMediaLibrary(tab: MediaLibraryTab, search: string, sort: "newest" | "oldest", cursor: number | null, signal?: AbortSignal, contactId?: number): Promise<MediaLibraryPage> {
  const query = new URLSearchParams({ tab, q: search, sort });
  if (cursor) query.set("cursor", String(cursor));
  if (contactId !== undefined) query.set("contactId", String(contactId));
  const response = await fetch(`${API_URL}/media-library?${query}`, { credentials: "include", signal, cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar a biblioteca.");
  return response.json();
}

export async function getContactMediaSummary(contactId: number, signal?: AbortSignal): Promise<ContactMediaSummary> {
  const query = new URLSearchParams({ contactId: String(contactId), summary: "1" });
  const response = await fetch(`${API_URL}/media-library?${query}`, { credentials: "include", signal, cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar as mídias do contato.");
  return response.json();
}

export function libraryMediaUrl(id: number) { return `${API_URL}/messages/${id}/media`; }

export async function downloadLibraryItem(item: MediaLibraryItem) {
  const response = await fetch(libraryMediaUrl(item.id), { credentials: "include" });
  if (!response.ok) throw new Error("Não foi possível baixar o arquivo. Tente novamente.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = item.fileName || `midia-${item.id}.${item.type === "VIDEO" ? "mp4" : item.type === "IMAGE" ? "jpg" : "bin"}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
