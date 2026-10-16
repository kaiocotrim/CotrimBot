import { Router } from "express";
import { createScheduledMessage, deleteScheduledMessage, getScheduledMessages } from "../controllers/scheduled-message.controller.js";

export const scheduledMessageRouter = Router();

scheduledMessageRouter.post("/scheduled-messages", createScheduledMessage);
scheduledMessageRouter.get("/scheduled-messages", getScheduledMessages);
scheduledMessageRouter.delete("/scheduled-messages/:id", deleteScheduledMessage);
