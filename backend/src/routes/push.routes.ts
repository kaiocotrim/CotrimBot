import { Router } from "express";
import { getPushPublicKey, subscribePush, unsubscribePush } from "../controllers/push.controller.js";

export const pushRouter = Router();

pushRouter.get("/push/public-key", getPushPublicKey);
pushRouter.post("/push/subscribe", subscribePush);
pushRouter.post("/push/unsubscribe", unsubscribePush);
