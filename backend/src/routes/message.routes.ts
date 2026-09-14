import { Router } from "express";
import {
  createMessage,
  getMessages,
} from "../controllers/message.controller.js";

export const messageRouter = Router();

// GET /contacts/:id/messages - Retorna as mensagens de um contato
messageRouter.get("/contacts/:id/messages", getMessages);

// POST /contacts/:id/messages - Cria uma mensagem para um contato
messageRouter.post("/contacts/:id/messages", createMessage);
