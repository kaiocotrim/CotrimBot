import webpush from "web-push";
import { prisma } from "../lib/prisma.js";

export type PushPayload = {
  id: number | null;
  type: string;
  title: string;
  body: string;
  contactId: number | null;
};

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@cotrimbot.local";

// Sem chaves VAPID o push fica desativado, mas o restante das notificações continua funcionando.
export const pushEnabled = Boolean(publicKey && privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
} else {
  console.warn("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não definidas: notificações push desativadas.");
}

export function getVapidPublicKey() {
  return pushEnabled ? publicKey! : null;
}

// Envia o payload para todos os navegadores/dispositivos inscritos do usuário.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!pushEnabled) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        body,
        { TTL: 60 * 60 * 24 },
      );
    } catch (error) {
      // 404/410: a assinatura expirou ou foi revogada pelo navegador; remove do banco.
      if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        return;
      }
      console.error("Erro ao enviar notificação push:", error);
    }
  }));
}
