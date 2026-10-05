import { Router } from "express";
import type { Request, Response } from "express";
import { getWhatsAppConnectionState, getWhatsAppQrCode, logoutWhatsAppInstance } from "../services/evolution.service.js";

export const evolutionRouter = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findString(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key]) return value[key] as string;
  }
  for (const nested of [value.instance, value.qrcode, value.data]) {
    const found = findString(nested, keys);
    if (found) return found;
  }
  return null;
}

function requireAdminRole(request: Request, response: Response) {
  if (request.user?.role !== "admin") {
    response.status(403).json({ message: "Apenas administradores podem configurar o WhatsApp." });
    return false;
  }
  return true;
}

evolutionRouter.get("/evolution/connection", async (request, response) => {
  if (!requireAdminRole(request, response)) return;
  try {
    const result = await getWhatsAppConnectionState();
    const state = findString(result.data, ["state", "status"]) ?? "unknown";
    response.json({ instance: result.instance, state, connected: state === "open" || state === "connected" });
  } catch (error) {
    console.error("Falha ao consultar conexão da Evolution:", error);
    response.status(502).json({ message: "Não foi possível consultar a conexão do WhatsApp." });
  }
});

evolutionRouter.get("/evolution/qrcode", async (request, response) => {
  if (!requireAdminRole(request, response)) return;
  try {
    const result = await getWhatsAppQrCode();
    const rawQrCode = findString(result.data, ["base64", "qrcode"]);
    const pairingCode = findString(result.data, ["pairingCode"]);
    const qrCode = rawQrCode
      ? rawQrCode.startsWith("data:image") ? rawQrCode : `data:image/png;base64,${rawQrCode}`
      : null;
    response.json({ instance: result.instance, qrCode, pairingCode });
  } catch (error) {
    console.error("Falha ao obter QR Code da Evolution:", error);
    response.status(502).json({ message: "Não foi possível gerar o QR Code do WhatsApp." });
  }
});

evolutionRouter.delete("/evolution/connection", async (request, response) => {
  if (!requireAdminRole(request, response)) return;
  try {
    await logoutWhatsAppInstance();
    response.json({ disconnected: true });
  } catch (error) {
    console.error("Falha ao encerrar conexão da Evolution:", error);
    response.status(502).json({ message: "Não foi possível encerrar a conexão do WhatsApp." });
  }
});
