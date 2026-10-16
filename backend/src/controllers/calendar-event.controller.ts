import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

const categories = ["MEETING", "TRAINING", "DEADLINE", "APPOINTMENT", "OTHER"] as const;
const creatorSelection = { select: { name: true, image: true } } as const;

function withCreator<T extends { userId: string; user: { name: string; image: string | null } }>(event: T, viewerId: string) {
  const { user, ...fields } = event;
  return { ...fields, creator: user, canManage: event.userId === viewerId };
}

export function createCalendarEventHandlers(database: Pick<typeof prisma, "calendarEvent"> = prisma) {
  async function getCalendarEvents(request: Request, response: Response) {
    const fromValue = request.query.from;
    const toValue = request.query.to;
    if (typeof fromValue !== "string" || typeof toValue !== "string") {
      return response.status(400).json({ error: "Informe o período do calendário." });
    }

    const from = new Date(fromValue);
    const to = new Date(toValue);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 45 * 24 * 60 * 60 * 1000) {
      return response.status(400).json({ error: "Período inválido." });
    }

    const events = await database.calendarEvent.findMany({
      where: { OR: [{ userId: request.user!.id }, { isPublic: true }], startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: "asc" },
      include: { user: creatorSelection },
    });
    return response.json({ events: events.map((event) => withCreator(event, request.user!.id)) });
  }

  async function createCalendarEvent(request: Request, response: Response) {
    const input = request.body as Record<string, unknown> | undefined;
    if (!input) return response.status(400).json({ error: "Dados do evento inválidos." });
    if (input.isPublic !== undefined && typeof input.isPublic !== "boolean") {
      return response.status(400).json({ error: "Visibilidade do evento inválida." });
    }

    const title = typeof input.title === "string" ? input.title.trim() : "";
    const companyName = typeof input.companyName === "string" ? input.companyName.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const category = categories.find((value) => value === input.category) ?? "OTHER";
    const startsAt = typeof input.startsAt === "string" ? new Date(input.startsAt) : new Date(NaN);
    const endsAt = typeof input.endsAt === "string" ? new Date(input.endsAt) : new Date(NaN);

    if (!title || title.length > 191) return response.status(400).json({ error: "Informe um título de até 191 caracteres." });
    if (companyName.length > 191 || description.length > 5000) return response.status(400).json({ error: "Empresa ou descrição muito longa." });
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      return response.status(400).json({ error: "Informe horários válidos, com término após o início." });
    }

    const event = await database.calendarEvent.create({
      data: {
        userId: request.user!.id,
        title,
        companyName: companyName || null,
        description: description || null,
        category,
        isPublic: input.isPublic === true,
        startsAt,
        endsAt,
      },
      include: { user: creatorSelection },
    });
    return response.status(201).json({ event: withCreator(event, request.user!.id) });
  }

  async function setCalendarEventCompleted(request: Request, response: Response) {
    const input = request.body as { completed?: unknown } | undefined;
    if (typeof input?.completed !== "boolean") {
      return response.status(400).json({ error: "Informe se o compromisso foi concluído." });
    }

    const result = await database.calendarEvent.updateMany({
      where: { id: String(request.params.id), userId: request.user!.id },
      data: { completedAt: input.completed ? new Date() : null },
    });
    if (!result.count) return response.status(404).json({ error: "Compromisso não encontrado." });

    const event = await database.calendarEvent.findUniqueOrThrow({
      where: { id: String(request.params.id) },
      include: { user: creatorSelection },
    });
    return response.json({ event: withCreator(event, request.user!.id) });
  }

  async function deleteCalendarEvent(request: Request, response: Response) {
    const id = request.params.id;
    if (typeof id !== "string" || !id) return response.status(400).json({ error: "Identificador do compromisso inválido." });

    const result = await database.calendarEvent.deleteMany({
      where: { id, userId: request.user!.id },
    });
    if (!result.count) return response.status(404).json({ error: "Compromisso não encontrado." });

    return response.status(204).send();
  }

  return { getCalendarEvents, createCalendarEvent, setCalendarEventCompleted, deleteCalendarEvent };
}

export const { getCalendarEvents, createCalendarEvent, setCalendarEventCompleted, deleteCalendarEvent } = createCalendarEventHandlers();
