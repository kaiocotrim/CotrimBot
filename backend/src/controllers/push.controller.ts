import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getVapidPublicKey } from "../services/push.service.js";

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

// GET /push/public-key - Chave pública VAPID usada pelo navegador para assinar o push
export async function getPushPublicKey(_req: Request, res: Response) {
  const publicKey = getVapidPublicKey();
  if (!publicKey) return res.status(503).json({ message: "Notificações push não configuradas no servidor" });
  return res.json({ publicKey });
}

// POST /push/subscribe - Salva (ou transfere para o usuário atual) a assinatura do navegador
export async function subscribePush(req: Request, res: Response) {
  const endpoint = readString(req.body?.endpoint, 512);
  const p256dh = readString(req.body?.keys?.p256dh, 255);
  const auth = readString(req.body?.keys?.auth, 255);
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith("https://")) {
    return res.status(400).json({ message: "Assinatura push inválida" });
  }

  const userId = req.user!.id;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth },
    create: { userId, endpoint, p256dh, auth },
  });
  return res.status(204).end();
}

// POST /push/unsubscribe - Remove a assinatura do navegador atual
export async function unsubscribePush(req: Request, res: Response) {
  const endpoint = readString(req.body?.endpoint, 512);
  if (!endpoint) return res.status(400).json({ message: "Endpoint inválido" });
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
  return res.status(204).end();
}
