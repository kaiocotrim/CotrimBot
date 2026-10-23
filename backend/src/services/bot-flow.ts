import { advanceSacTest, startSacTest, SAC_TEST_CATALOG, type SacTestCatalog, type SacTestState, type SacTestSubmission } from './bot-sac-test.js';

export type BotOption = { id: string; number: string; label: string; description?: string; active: boolean; action: "MESSAGE" | "SUBMENU" | "HUMAN" | "IMAGE" | "CLOSE" | "SAC_TEST"; response: string; targetMenuId: string; imageId?: string };
export type BotMenu = { id: string; name: string; text: string; options: BotOption[]; imageId?: string };
export type BotFlow = { rootMenuId: string; invalidMessage: string; backLabel: string; menus: BotMenu[]; layout?: Record<string, { x: number; y: number }> };
export type BotState = { menuId: string; stack: string[]; status: "BOT_ACTIVE" | "WAITING_HUMAN" | "HUMAN_ACTIVE" | "CLOSED"; sacTest?: SacTestState };
export type BotReply = { state: BotState; text: string; imageId?: string; sacTestSubmission?: SacTestSubmission };

export function isProvisionalReply(text: string): boolean {
  return /^(?:fase\s+beta|teste|testando|em\s+breve)[\s.!…]*$/i.test(text.trim());
}

export function validateFlow(value: unknown, publish = false): asserts value is BotFlow {
  const fail = (message: string): never => { throw new Error(message); };
  if (!value || typeof value !== "object") fail("Fluxo inválido.");
  const f = value as BotFlow;
  const string = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
  const image = (v: unknown) => v === undefined || (typeof v === "string" && (v === "" || /^[a-zA-Z0-9_-]{1,80}$/.test(v)));
  if (f.layout !== undefined && (!f.layout || typeof f.layout !== "object" || Array.isArray(f.layout)
    || Object.keys(f.layout).length > 3000 || Object.entries(f.layout).some(([key, p]) => key.length > 180 || !p
      || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > 10000 || p.y > 10000))) fail("Posição de nó inválida.");
  if (!string(f.rootMenuId, 80) || !string(f.invalidMessage, 1000) || !string(f.backLabel, 100)
    || !Array.isArray(f.menus) || !f.menus.length || f.menus.length > 50) fail("Informe entre 1 e 50 menus e mensagens válidas.");
  const ids = new Set<string>();
  const optionIds = new Set<string>();
  for (const m of f.menus) {
    if (!m || !string(m.id, 80) || !m.id || ids.has(m.id) || !string(m.name, 100) || !string(m.text, 8000) || !image(m.imageId)
      || !Array.isArray(m.options) || m.options.length > 50) fail("Menu inválido ou duplicado (máximo 50 opções).");
    ids.add(m.id);
    const numbers = new Set<string>();
    for (const o of m.options) {
      if (!o || !string(o.id, 80) || !o.id || optionIds.has(o.id) || typeof o.number !== "string" || !/^[1-9]\d{0,2}$/.test(o.number)
        || numbers.has(o.number) || !string(o.label, 200) || o.description !== undefined && !string(o.description, 500) || !string(o.response, 8000)
        || !string(o.targetMenuId, 80) || !image(o.imageId) || typeof o.active !== "boolean" || !["MESSAGE", "SUBMENU", "HUMAN", "IMAGE", "CLOSE", "SAC_TEST"].includes(o.action)) fail("Opção inválida ou número duplicado. Use números de 1 a 999; 0 é reservado.");
      numbers.add(o.number); optionIds.add(o.id);
      if (publish && o.active && (!o.label.trim() || (["MESSAGE", "HUMAN", "CLOSE"].includes(o.action) && !o.response.trim()))) fail("Preencha o nome e a resposta das opções ativas.");
      if (publish && o.active && o.action !== "SUBMENU" && isProvisionalReply(o.response)) fail(`Substitua a resposta provisória da opção ${o.number} — ${o.label} no menu "${m.name}" antes de publicar.`);
      if (publish && o.active && o.action === "IMAGE" && !o.imageId) fail(`Envie uma imagem para a opção ${o.number} do menu "${m.name}".`);
    }
    if (publish && !m.text.trim() && !m.imageId) fail(`Preencha a mensagem do menu "${m.name || m.id}".`);
    if (publish && isProvisionalReply(m.text)) fail(`Substitua a mensagem provisória do menu "${m.name}" antes de publicar.`);
  }
  if (!ids.has(f.rootMenuId)) fail("Menu principal inexistente.");
  for (const menu of f.menus) for (const option of menu.options) {
    if (option.action === "SUBMENU" && !ids.has(option.targetMenuId)) fail("Selecione um submenu existente.");
  }
  if (publish && (!f.invalidMessage.trim() || !f.backLabel.trim())) fail("Preencha a orientação de opção inválida e o texto de retorno.");
}

export function renderMenu(flow: BotFlow, id: string): string {
  const menu = flow.menus.find(m => m.id === id)!;
  return [menu.text, ...menu.options.filter(o => o.active).map(o => `${o.number} — ${o.label}${o.description?.trim() ? `\n${o.description.trim()}` : ""}`), `0 — ${flow.backLabel}`].filter(Boolean).join("\n\n");
}

// Both the simulator and WhatsApp runtime call this pure transition function.
function menuReply(flow: BotFlow, state: BotState): BotReply {
  const imageId = flow.menus.find(menu => menu.id === state.menuId)!.imageId;
  return { state, text: renderMenu(flow, state.menuId), ...(imageId ? { imageId } : {}) };
}

export function advanceBot(flow: BotFlow, state: BotState | null, input: string, context: { catalog?: SacTestCatalog; messageId?: string; inputType?: string } = {}): BotReply {
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
  if (option.action === 'SAC_TEST') return startSacTest(state, context.messageId ?? 'simulation', context.catalog ?? SAC_TEST_CATALOG);
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
