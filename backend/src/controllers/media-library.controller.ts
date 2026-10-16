import type { Request, Response } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { contactDisplayName } from "../utils/contact-name.js";

export function extractMessageLinks(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi) ?? [];
  const links = matches.slice(0, 50).flatMap((match) => {
    const cleaned = match.replace(/[.,!?;:]+$/, "").replace(/[\])}]+$/, "");
    try {
      const url = new URL(/^www\./i.test(cleaned) ? `https://${cleaned}` : cleaned);
      return url.protocol === "http:" || url.protocol === "https:" ? [url.href] : [];
    } catch { return []; }
  });
  return [...new Set(links)];
}

export function createMediaLibraryHandler(database: Pick<typeof prisma, "message"> = prisma) {
  return async function getMediaLibrary(request: Request, response: Response) {
    const tab = request.query.tab ?? "media";
    const sort = request.query.sort ?? "newest";
    const cursorValue = request.query.cursor;
    const cursor = cursorValue === undefined ? null : Number(cursorValue);
    const contactIdValue = request.query.contactId;
    const contactId = typeof contactIdValue === "string" && /^[1-9]\d*$/.test(contactIdValue) ? Number(contactIdValue) : null;
    const summary = request.query.summary === "1";
    const search = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
    if (!["media", "documents", "links"].includes(String(tab)) || !["newest", "oldest"].includes(String(sort))
      || cursor !== null && (!Number.isInteger(cursor) || cursor <= 0)
      || contactIdValue !== undefined && (contactId === null || !Number.isSafeInteger(contactId))
      || request.query.summary !== undefined && !summary
      || summary && contactId === null) {
      return response.status(400).json({ error: "Filtros da biblioteca inválidos." });
    }
    const mediaCategory: Prisma.MessageWhereInput = { type: { in: ["IMAGE", "VIDEO"] } };
    const linksCategory: Prisma.MessageWhereInput = { type: "TEXT", OR: [{ content: { contains: "https://" } }, { content: { contains: "http://" } }, { content: { contains: "www." } }] };
    const category: Prisma.MessageWhereInput = tab === "media" ? mediaCategory
      : tab === "documents" ? { type: "DOCUMENT" }
      : linksCategory;
    const visibleWhere: Prisma.MessageWhereInput = {
      deletedAt: null,
      viewOnce: false,
      private: false,
      deletions: { none: { userId: request.user!.id } },
      ...(contactId !== null ? { contactId } : {}),
    };
    const where: Prisma.MessageWhereInput = {
      ...visibleWhere,
      AND: [category, ...(search ? [{ OR: [
        { content: { contains: search } },
        { contact: { name: { contains: search } } },
        { senderName: { contains: search } },
        { cachedMedia: { fileName: { contains: search } } },
      ] }] : [])],
    };
    const direction = !summary && sort === "oldest" ? "asc" : "desc";
    const [messages, count] = await Promise.all([database.message.findMany({
      where: summary ? { ...visibleWhere, AND: [mediaCategory] } : where,
      orderBy: [{ createdAt: direction }, { id: direction }],
      ...(!summary && cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: summary ? 4 : 49,
      select: {
        id: true, type: true, content: true, createdAt: true, direction: true, senderName: true,
        contact: { select: { id: true, name: true, phone: true, isGroup: true, isSaved: true } },
        cachedMedia: { select: { fileName: true, mimetype: true } },
        sentByUser: { select: { name: true } },
      },
    }), summary ? database.message.count({ where: { ...visibleWhere, OR: [mediaCategory, { type: "DOCUMENT" }, linksCategory] } }) : Promise.resolve(null)]);
    const page = messages.slice(0, summary ? 4 : 48);
    const items = page.map((message) => ({
      id: message.id, type: message.type, content: message.content, createdAt: message.createdAt,
      contactId: message.contact.id, contactName: contactDisplayName(message.contact),
      senderName: message.direction === "OUTGOING" ? message.sentByUser?.name ?? "Você" : message.senderName ?? contactDisplayName(message.contact),
      fileName: message.cachedMedia?.fileName ?? (message.type === "DOCUMENT" ? message.content : null),
      mimeType: message.cachedMedia?.mimetype ?? null,
      links: !summary && tab === "links" ? extractMessageLinks(message.content) : [],
    })).filter((item) => summary || tab !== "links" || item.links.length > 0);
    if (summary) return response.json({ count, items });
    return response.json({ items, hasMore: messages.length > 48, nextCursor: messages.length > 48 ? page.at(-1)!.id : null });
  };
}

export const getMediaLibrary = createMediaLibraryHandler();
