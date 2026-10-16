import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return withCountryCode.length >= 12 && withCountryCode.length <= 15 ? withCountryCode : null;
}

export async function getScheduledMessages(request: Request, response: Response) {
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

  const messages = await prisma.scheduledMessage.findMany({
    where: { userId: request.user!.id, scheduledAt: { gte: from, lt: to } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, phone: true, content: true, scheduledAt: true, status: true, sentAt: true },
  });
  if (!messages.length) return response.json({ messages: [] });

  const contacts = await prisma.contact.findMany({
    where: { isSaved: true, phone: { in: [...new Set(messages.map((message) => message.phone))] } },
    select: { phone: true, name: true },
  });
  const namesByPhone = new Map(contacts.map((contact) => [contact.phone, contact.name]));
  return response.json({ messages: messages.map((message) => ({ ...message, contactName: namesByPhone.get(message.phone) ?? null })) });
}

export async function createScheduledMessage(request: Request, response: Response) {
  const input = request.body as Record<string, unknown> | undefined;
  const phone = typeof input?.phone === "string" ? normalizePhone(input.phone) : null;
  const content = typeof input?.content === "string" ? input.content.trim() : "";
  const scheduledAt = typeof input?.scheduledAt === "string" ? new Date(input.scheduledAt) : new Date(NaN);
  const now = Date.now();

  if (!phone) return response.status(400).json({ error: "Informe um número válido com DDD." });
  if (!content || content.length > 5000) return response.status(400).json({ error: "A mensagem deve ter até 5.000 caracteres." });
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= now) {
    return response.status(400).json({ error: "Escolha uma data e horário futuros." });
  }

  const scheduledMessage = await prisma.scheduledMessage.create({
    data: { userId: request.user!.id, phone, content, scheduledAt },
    select: { id: true, phone: true, content: true, scheduledAt: true, status: true },
  });
  return response.status(201).json({ scheduledMessage });
}

export async function deleteScheduledMessage(request: Request, response: Response) {
  const id = request.params.id;
  if (typeof id !== "string" || !id) return response.status(400).json({ error: "Identificador da mensagem inválido." });
  const scheduledMessage = await prisma.scheduledMessage.findFirst({
    where: { id, userId: request.user!.id },
    select: { id: true, status: true },
  });

  if (!scheduledMessage) return response.status(404).json({ error: "Mensagem programada não encontrada." });
  if (scheduledMessage.status === "PROCESSING") {
    return response.status(409).json({ error: "Esta mensagem está sendo enviada e não pode ser excluída agora." });
  }

  const deleted = await prisma.scheduledMessage.deleteMany({
    where: { id, userId: request.user!.id, status: { not: "PROCESSING" } },
  });
  if (!deleted.count) return response.status(409).json({ error: "Esta mensagem começou a ser enviada e não pode mais ser excluída." });

  return response.status(204).send();
}
