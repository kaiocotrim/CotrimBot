import type { Request, Response } from "express";

export async function whatsappWebhook(req: Request, res: Response) {
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("Webhook recebido:");
  console.log(req.body);

  return res.status(200).json({
    received: true,
  });
}
