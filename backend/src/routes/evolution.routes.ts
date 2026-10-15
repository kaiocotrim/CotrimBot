import { Router } from "express";
import type { Request, Response } from "express";
import {
  DEFAULT_CALL_REJECTION_MESSAGE,
  EvolutionSettingsError,
  getWhatsAppCallSettings,
  getWhatsAppConnectionState,
  getWhatsAppQrCode,
  logoutWhatsAppInstance,
  updateWhatsAppCallSettings,
} from "../services/evolution.service.js";

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

function respondToSettingsError(response: Response, error: unknown) {
  if (!(error instanceof EvolutionSettingsError)) {
    console.error("Falha inesperada ao configurar chamadas da Evolution.");
    response.status(502).json({ message: "Não foi possível acessar as configurações de chamadas." });
    return;
  }

  const status = error.code === "configuration"
    ? 503
    : error.code === "timeout"
      ? 504
      : 502;
  const messages: Record<typeof error.code, string> = {
    configuration: "A integração com o WhatsApp não está configurada no servidor.",
    authentication: "A Evolution API recusou as credenciais configuradas.",
    timeout: "A Evolution API demorou demais para responder.",
    unavailable: "A Evolution API está indisponível no momento.",
    invalid_response: "A Evolution API retornou uma resposta inesperada.",
    not_confirmed: "A Evolution API não confirmou o salvamento das configurações.",
  };

  console.error(`Falha ao configurar chamadas da Evolution: ${error.code}`);
  response.status(status).json({ message: messages[error.code] });
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

evolutionRouter.get("/evolution/call-settings", async (request, response) => {
  if (!requireAdminRole(request, response)) return;

  try {
    const settings = await getWhatsAppCallSettings();
    response.json({ ...settings, suggestedMessage: DEFAULT_CALL_REJECTION_MESSAGE });
  } catch (error) {
    respondToSettingsError(response, error);
  }
});

evolutionRouter.put("/evolution/call-settings", async (request, response) => {
  if (!requireAdminRole(request, response)) return;

  const rejectCall = isRecord(request.body) ? request.body.rejectCall : undefined;
  const rawMessage = isRecord(request.body) ? request.body.msgCall : undefined;
  if (typeof rejectCall !== "boolean" || typeof rawMessage !== "string") {
    response.status(400).json({ message: "Informe o estado da recusa e uma mensagem válida." });
    return;
  }

  const msgCall = rawMessage.trim();
  if (msgCall.length > 1_000 || (rejectCall && msgCall.length === 0)) {
    response.status(400).json({
      message: msgCall.length > 1_000
        ? "A mensagem deve ter no máximo 1.000 caracteres."
        : "Informe a mensagem enviada quando uma chamada for recusada.",
    });
    return;
  }

  try {
    response.json(await updateWhatsAppCallSettings({ rejectCall, msgCall }));
  } catch (error) {
    respondToSettingsError(response, error);
  }
});
