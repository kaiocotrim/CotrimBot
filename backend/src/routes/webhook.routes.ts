import { Router } from "express";
import { whatsappWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.post("/webhook/whatsapp", whatsappWebhook);

export default router;