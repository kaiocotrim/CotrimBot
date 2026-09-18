import { Router } from "express";
import { whatsappWebhook } from "../controllers/webhook.controller.js";

const router = Router();

// Recebe eventos de mensagens enviados pela Evolution API.
// O controller interpreta o corpo JSON e atualiza o banco e o frontend.
router.post("/webhook/whatsapp", whatsappWebhook);

export default router;
