const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type AppNotification = {
  id: number;
  type: "CONVERSATION_ASSIGNED" | "NEW_MESSAGE";
  title: string;
  body: string;
  contactId: number | null;
  readAt: string | null;
  createdAt: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error("Não foi possível atualizar as notificações");
  return response;
}

export async function getNotifications() {
  const response = await request("/notifications");
  return (await response.json()) as { notifications: AppNotification[]; unreadCount: number };
}

export async function markNotificationRead(id: number) {
  await request(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead() {
  await request("/notifications/read-all", { method: "PATCH" });
}

export async function clearNotifications() {
  await request("/notifications", { method: "DELETE" });
}
