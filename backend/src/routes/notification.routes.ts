import { Router } from "express";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsAsRead,
  markContactNotificationsAsRead,
  markNotificationAsRead,
} from "../controllers/notification.controller.js";

export const notificationRouter = Router();

notificationRouter.get("/notifications", getNotifications);
notificationRouter.patch("/notifications/read-all", markAllNotificationsAsRead);
notificationRouter.patch("/notifications/contact/:contactId/read", markContactNotificationsAsRead);
notificationRouter.patch("/notifications/:id/read", markNotificationAsRead);
notificationRouter.delete("/notifications", clearNotifications);
