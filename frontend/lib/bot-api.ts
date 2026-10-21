export type BotOption = { id: string; number: string; label: string; active: boolean; action: "MESSAGE" | "SUBMENU" | "HUMAN"; response: string; targetMenuId: string };
export type BotMenu = { id: string; name: string; text: string; options: BotOption[] };
export type BotFlow = { rootMenuId: string; invalidMessage: string; backLabel: string; menus: BotMenu[]; layout?: Record<string, { x: number; y: number }> };
export type Bot = { id: string; name: string; revision: number; published: BotFlow | null; draft: BotFlow };
export type BotList = { bots: Bot[]; activeBotId: string | null; instanceAvailable: boolean };
export type Simulation = { state: { status: string; menuId: string }; messages: { role: string; text: string }[] };

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
