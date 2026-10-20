import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getSocketServer } from "../lib/socket.js";
import { userRoom } from "../services/notification.service.js";

// GET /notifications - Últimas notificações do usuário e total de não lidas
export async function getNotifications(req: Request, res: Response) {
  const userId = req.user!.id;
  // Registros antigos de mensagem não aparecem mais; mensagens agora são só push.
  const where = { userId, type: { not: "NEW_MESSAGE" as const } };
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return res.json({ notifications, unreadCount });
}

// PATCH /notifications/read-all
export async function markAllNotificationsAsRead(req: Request, res: Response) {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count) {
    getSocketServer().to(userRoom(req.user!.id)).emit("notifications_read_all");
  }
  return res.status(204).end();
}

// PATCH /notifications/contact/:contactId/read
export async function markContactNotificationsAsRead(req: Request, res: Response) {
  const contactId = Number(req.params.contactId);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    return res.status(400).json({ message: "Contato inválido" });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id, contactId, readAt: null },
    select: { id: true },
  });
  if (notifications.length) {
    await prisma.notification.updateMany({
      where: { id: { in: notifications.map(({ id }) => id) } },
      data: { readAt: new Date() },
    });
    getSocketServer().to(userRoom(req.user!.id)).emit("notifications_read", {
      ids: notifications.map(({ id }) => id),
    });
  }
  return res.status(204).end();
}

// PATCH /notifications/:id/read
export async function markNotificationAsRead(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Notificação inválida" });
  const result = await prisma.notification.updateMany({
    where: { id, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count) {
    getSocketServer().to(userRoom(req.user!.id)).emit("notifications_read", { ids: [id] });
  }
  return res.status(204).end();
}

// DELETE /notifications
export async function clearNotifications(req: Request, res: Response) {
  await prisma.notification.deleteMany({ where: { userId: req.user!.id } });
  return res.status(204).end();
}
