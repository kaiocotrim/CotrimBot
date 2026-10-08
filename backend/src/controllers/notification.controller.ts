import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// GET /notifications - Últimas notificações do usuário e total de não lidas
export async function getNotifications(req: Request, res: Response) {
  const userId = req.user!.id;
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return res.json({ notifications, unreadCount });
}

// PATCH /notifications/read-all
export async function markAllNotificationsAsRead(req: Request, res: Response) {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  return res.status(204).end();
}

// PATCH /notifications/:id/read
export async function markNotificationAsRead(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Notificação inválida" });
  await prisma.notification.updateMany({
    where: { id, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  return res.status(204).end();
}

// DELETE /notifications
export async function clearNotifications(req: Request, res: Response) {
  await prisma.notification.deleteMany({ where: { userId: req.user!.id } });
  return res.status(204).end();
}
