import type { BotFlow } from "./bot-flow.js";

export function isProvisionalReply(text: string): boolean {
  return /^(?:fase\s+beta|teste|testando|em\s+breve)[\s.!…]*$/i.test(text.trim());
}

export function validateBotFlowStructure(value: unknown, publish = false): asserts value is BotFlow {
  const fail = (message: string): never => { throw new Error(message); };
  if (!value || typeof value !== "object") fail("Fluxo inválido.");
  const f = value as BotFlow;
  if (f.assignedUserId !== undefined && (typeof f.assignedUserId !== "string" || f.assignedUserId.length > 191)) fail("Membro atribuído inválido.");
  if (f.sacTicketHandoff !== undefined && !["UNASSIGNED", "BOT"].includes(f.sacTicketHandoff)) fail("Destino após abertura do chamado inválido.");
  if (f.sacLookup !== undefined) {
    const routing = f.sacLookup;
    if (!routing || typeof routing !== 'object' || !Array.isArray(routing.technicians) || routing.technicians.length > 200
      || routing.fallbackUserId !== undefined && (typeof routing.fallbackUserId !== 'string' || routing.fallbackUserId.length > 191)
      || routing.fallbackUserId && routing.fallbackUserId === f.assignedUserId) fail('Destino de suporte inválido.');
    const names = new Set<string>();
    for (const technician of routing.technicians) {
      if (!technician || typeof technician.name !== 'string' || !technician.name.trim() || technician.name.length > 191
        || typeof technician.userId !== 'string' || !technician.userId || technician.userId.length > 191
        || technician.userId === f.assignedUserId || typeof technician.available !== 'boolean') fail('Vínculo de técnico inválido.');
      const name = technician.name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (names.has(name)) fail('Técnico duplicado na configuração.');
      names.add(name);
    }
  }
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
        || !string(o.targetMenuId, 80) || !image(o.imageId) || typeof o.active !== "boolean" || !["MESSAGE", "SUBMENU", "HUMAN", "IMAGE", "CLOSE", "SAC_TEST", "SAC_TICKET", "SAC_LOOKUP"].includes(o.action)) fail("Opção inválida ou número duplicado. Use números de 1 a 999; 0 é reservado.");
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
