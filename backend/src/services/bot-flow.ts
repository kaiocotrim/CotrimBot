export type BotOption = { id: string; number: string; label: string; active: boolean; action: "MESSAGE" | "SUBMENU" | "HUMAN" | "IMAGE"; response: string; targetMenuId: string; imageId?: string };
export type BotMenu = { id: string; name: string; text: string; options: BotOption[]; imageId?: string };
export type BotFlow = { rootMenuId: string; invalidMessage: string; backLabel: string; menus: BotMenu[]; layout?: Record<string, { x: number; y: number }> };
export type BotState = { menuId: string; stack: string[]; status: "BOT_ACTIVE" | "WAITING_HUMAN" | "HUMAN_ACTIVE" | "CLOSED" };
export type BotReply = { state: BotState; text: string; imageId?: string };

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
        || numbers.has(o.number) || !string(o.label, 200) || !string(o.response, 8000)
        || !string(o.targetMenuId, 80) || !image(o.imageId) || typeof o.active !== "boolean" || !["MESSAGE", "SUBMENU", "HUMAN", "IMAGE"].includes(o.action)) fail("Opção inválida ou número duplicado. Use números de 1 a 999; 0 é reservado.");
      numbers.add(o.number); optionIds.add(o.id);
      if (publish && o.active && (!o.label.trim() || (["MESSAGE", "HUMAN"].includes(o.action) && !o.response.trim()))) fail("Preencha o nome e a resposta das opções ativas.");
      if (publish && o.active && o.action === "IMAGE" && !o.imageId) fail(`Envie uma imagem para a opção ${o.number} do menu "${m.name}".`);
    }
    if (publish && !m.text.trim() && !m.imageId) fail(`Preencha a mensagem do menu "${m.name || m.id}".`);
  }
  if (!ids.has(f.rootMenuId)) fail("Menu principal inexistente.");
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail("Submenus circulares não são permitidos.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const o of f.menus.find(m => m.id === id)!.options) if (o.action === "SUBMENU") {
      if (!ids.has(o.targetMenuId)) fail("Selecione um submenu existente.");
      visit(o.targetMenuId);
    }
    visiting.delete(id); visited.add(id);
  };
  for (const id of ids) visit(id);
  if (publish && (!f.invalidMessage.trim() || !f.backLabel.trim())) fail("Preencha a orientação de opção inválida e o texto de retorno.");
}

export function renderMenu(flow: BotFlow, id: string): string {
  const menu = flow.menus.find(m => m.id === id)!;
  return [menu.text, ...menu.options.filter(o => o.active).map(o => `${o.number} — ${o.label}`), `0 — ${flow.backLabel}`].filter(Boolean).join("\n\n");
}

// Both the simulator and WhatsApp runtime call this pure transition function.
function menuReply(flow: BotFlow, state: BotState): BotReply {
  const imageId = flow.menus.find(menu => menu.id === state.menuId)!.imageId;
  return { state, text: renderMenu(flow, state.menuId), ...(imageId ? { imageId } : {}) };
}

export function advanceBot(flow: BotFlow, state: BotState | null, input: string): BotReply {
  if (state && state.status !== "BOT_ACTIVE") return { state, text: "" };
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
  if (option.action === "SUBMENU") return menuReply(flow, { ...state, menuId: option.targetMenuId, stack: [...state.stack, state.menuId] });
  if (option.action === "IMAGE") {
    if (!option.imageId) throw new Error("Opção incompleta: envie uma imagem antes de publicar.");
    return { state, imageId: option.imageId, text: [option.response, `0 — ${flow.backLabel}`].filter(Boolean).join("\n\n") };
  }
  if (!option.response.trim()) throw new Error("Opção incompleta: cadastre uma resposta antes de publicar.");
  return { state: { ...state, status: option.action === "HUMAN" ? "WAITING_HUMAN" : "BOT_ACTIVE" }, text: `${option.response}${option.action === "MESSAGE" ? `\n\n0 — ${flow.backLabel}` : ""}`, ...(option.action === "MESSAGE" && option.imageId ? { imageId: option.imageId } : {}) };
}
