export type BotOption = { id: string; number: string; label: string; description?: string; active: boolean; action: "MESSAGE" | "SUBMENU" | "HUMAN" | "IMAGE" | "CLOSE" | "SAC_TEST"; response: string; targetMenuId: string; imageId?: string };
export type BotMenu = { id: string; name: string; text: string; options: BotOption[]; imageId?: string };
export type BotFlow = { rootMenuId: string; invalidMessage: string; backLabel: string; menus: BotMenu[]; integrations?: import('../../backend/src/services/bot-integrations').BotIntegrations; layout?: Record<string, { x: number; y: number }> };
export type Bot = { id: string; name: string; revision: number; published: BotFlow | null; draft: BotFlow };
export type BotList = { bots: Bot[]; activeBotId: string | null; instanceAvailable: boolean };
export type Simulation = { state: { status: string; menuId: string; sacTest?: { step: string } }; quickReplies?: string[]; messages: { role: string; text: string; imageId?: string; menuId?: string; optionId?: string }[]; steps?: { menuId: string; optionId?: string; status: string }[] };

export function botImageUrl(id: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/bots/images/${encodeURIComponent(id)}`;
}

export async function uploadBotImage(file: File): Promise<{ id: string }> {
  const body = new FormData(); body.append("file", file);
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/bots/images`, { method: "POST", credentials: "include", body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Não foi possível enviar a imagem.");
  return data;
}

export async function botRequest<T>(path = "", body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/bots${path}`, {
    credentials: "include", method: body === undefined ? "GET" : method,
    headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Não foi possível concluir a operação.");
  return data as T;
}

export function emptyFlow(): BotFlow {
  return { rootMenuId: "root", invalidMessage: "Opção inválida. Selecione um dos números do menu.", backLabel: "Voltar", menus: [{ id: "root", name: "Menu principal", text: "", options: [] }] };
}
