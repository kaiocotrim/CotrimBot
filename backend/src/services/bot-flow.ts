import { advanceSacTest, startSacTest, SAC_TEST_CATALOG, type SacTestCatalog, type SacTestState } from './bot-sac-test.js';
import { validateBotIntegrations, type BotIntegrations } from './bot-integrations.js';
import { validateBotFlowStructure } from './bot-flow-validation.js';

export type BotOption = { id: string; number: string; label: string; description?: string; active: boolean; action: "MESSAGE" | "SUBMENU" | "HUMAN" | "IMAGE" | "CLOSE" | "SAC_TEST" | "SAC_TICKET"; response: string; targetMenuId: string; imageId?: string };
export type BotMenu = { id: string; name: string; text: string; options: BotOption[]; imageId?: string };
export type BotFlow = { rootMenuId: string; invalidMessage: string; backLabel: string; assignedUserId?: string; menus: BotMenu[]; integrations?: BotIntegrations; layout?: Record<string, { x: number; y: number }> };
export type BotState = { menuId: string; stack: string[]; status: "BOT_ACTIVE" | "WAITING_HUMAN" | "HUMAN_ACTIVE" | "CLOSED"; sacTest?: SacTestState };
export type BotReply = { state: BotState; text: string; imageId?: string; submitSacTicket?: boolean };

export { isProvisionalReply } from './bot-flow-validation.js';

export function validateFlow(value: unknown, publish = false): asserts value is BotFlow {
  validateBotFlowStructure(value, publish);
  if (value.integrations !== undefined) validateBotIntegrations(value.integrations);
}

export function renderMenu(flow: BotFlow, id: string): string {
  const menu = flow.menus.find(m => m.id === id)!;
  // Keep a final selection instruction after the choices, where the client acts on it.
  const instruction = menu.text.match(/(?:^|\n\s*\n)((?:Responda com o \*?número da opção desejada\*? para continuar\.|Digite o número da opção desejada\.))\s*$/u);
  const text = instruction ? menu.text.slice(0, instruction.index).trimEnd() : menu.text;
  return [
    text,
    ...menu.options.filter(o => o.active).map(o => `${o.number} — ${o.label}${o.description?.trim() ? `\n${o.description.trim()}` : ""}`),
    ...(id !== flow.rootMenuId ? [`0 — ${flow.backLabel}`] : []),
    instruction?.[1],
  ].filter(Boolean).join("\n\n");
}

// Both the simulator and WhatsApp runtime call this pure transition function.
function menuReply(flow: BotFlow, state: BotState): BotReply {
  const imageId = flow.menus.find(menu => menu.id === state.menuId)!.imageId;
  return { state, text: renderMenu(flow, state.menuId), ...(imageId ? { imageId } : {}) };
}

export function advanceBot(flow: BotFlow, state: BotState | null, input: string, context: { catalog?: SacTestCatalog; messageId?: string; inputType?: string; testMode?: boolean } = {}): BotReply {
  if (state && state.status !== "BOT_ACTIVE") return { state, text: "" };
  if (state?.sacTest) {
    const result = advanceSacTest(state, input, context.catalog ?? SAC_TEST_CATALOG, context.inputType);
    // Depois da conclusão/cancelamento, o comando 0 retorna ao menu principal.
    if (!result.state.sacTest) result.state.menuId = flow.rootMenuId;
    return result;
  }
  if (!state || !flow.menus.some(m => m.id === state.menuId)) {
    return menuReply(flow, { menuId: flow.rootMenuId, stack: [], status: "BOT_ACTIVE" });
  }
  if (input.trim() === "0") {
    const stack = [...state.stack];
    const menuId = stack.pop() ?? flow.rootMenuId;
    return menuReply(flow, { ...state, menuId, stack });
  }
  const option = flow.menus.find(m => m.id === state.menuId)!.options.find(o => o.active && o.number === input.trim());
  if (!option) return { state, text: `${flow.invalidMessage}\n\n${renderMenu(flow, state.menuId)}` };
  if (option.action === 'SAC_TEST' && context.testMode === false) return { state, text: 'Abertura de chamados de teste desativada. Retorne ao menu principal com 0.' };
  if (option.action === 'SAC_TEST') return startSacTest(state, context.messageId ?? 'simulation', context.catalog ?? SAC_TEST_CATALOG);
  if (option.action === 'SAC_TICKET') return startSacTest(state, context.messageId ?? 'simulation', context.catalog ?? SAC_TEST_CATALOG, true);
  if (option.action === "SUBMENU") {
    // Navigation advances once per client reply, so returning to a menu is safe.
    // Reuse its existing history instead of accumulating loops in the back stack.
    const previousIndex = state.stack.indexOf(option.targetMenuId);
    const stack = option.targetMenuId === flow.rootMenuId ? []
      : option.targetMenuId === state.menuId ? [...state.stack]
      : previousIndex >= 0 ? state.stack.slice(0, previousIndex)
      : [...state.stack, state.menuId];
    return menuReply(flow, { ...state, menuId: option.targetMenuId, stack });
  }
  if (option.action === "IMAGE") {
    if (!option.imageId) throw new Error("Opção incompleta: envie uma imagem antes de publicar.");
    return { state, imageId: option.imageId, text: [option.response, `0 — ${flow.backLabel}`].filter(Boolean).join("\n\n") };
  }
  if (!option.response.trim()) throw new Error("Opção incompleta: cadastre uma resposta antes de publicar.");
  return { state: { ...state, status: option.action === "HUMAN" ? "WAITING_HUMAN" : option.action === "CLOSE" ? "CLOSED" : "BOT_ACTIVE" }, text: `${option.response}${option.action === "MESSAGE" ? `\n\n0 — ${flow.backLabel}` : ""}`, ...(["MESSAGE", "CLOSE"].includes(option.action) && option.imageId ? { imageId: option.imageId } : {}) };
}
