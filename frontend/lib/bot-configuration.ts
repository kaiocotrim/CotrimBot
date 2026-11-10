import { validateBotFlowStructure } from "../../backend/src/services/bot-flow-validation";
import { validateBotIntegrations } from "../../backend/src/services/bot-integrations";
import { botImageUrl, uploadBotImage, type BotFlow } from "./bot-api";

export const BOT_CONFIGURATION_MAX_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FORMAT = "cotrimbot.bot";
type BotConfigurationImage = { id: string; mimeType: string; data: string };
export type BotConfiguration = {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  name: string;
  draft: BotFlow;
  images: BotConfigurationImage[];
};

function validateFlow(value: unknown): asserts value is BotFlow {
  validateBotFlowStructure(value);
  if (value.integrations !== undefined) validateBotIntegrations(value.integrations);
}

/** Only configuration fields belong in a portable file, never database/session metadata. */
function copyFlow(flow: BotFlow): BotFlow {
  return {
    rootMenuId: flow.rootMenuId, invalidMessage: flow.invalidMessage, backLabel: flow.backLabel,
    ...(flow.assignedUserId !== undefined ? { assignedUserId: flow.assignedUserId } : {}),
    ...(flow.sacLookup ? { sacLookup: { ...(flow.sacLookup.fallbackUserId !== undefined ? { fallbackUserId: flow.sacLookup.fallbackUserId } : {}),
      technicians: flow.sacLookup.technicians.map(technician => ({ name: technician.name, userId: technician.userId, available: technician.available })) } } : {}),
    menus: flow.menus.map(menu => ({
      id: menu.id, name: menu.name, text: menu.text,
      ...(menu.imageId ? { imageId: menu.imageId } : {}),
      options: menu.options.map(option => ({
        id: option.id, number: option.number, label: option.label,
        ...(option.description !== undefined ? { description: option.description } : {}),
        active: option.active, action: option.action, response: option.response, targetMenuId: option.targetMenuId,
        ...(option.imageId ? { imageId: option.imageId } : {}),
      })),
    })),
    ...(flow.layout ? { layout: Object.fromEntries(Object.entries(flow.layout).map(([id, position]) => [id, { x: position.x, y: position.y }])) } : {}),
    ...(flow.integrations ? { integrations: {
      baseUrl: flow.integrations.baseUrl, tokenEnv: flow.integrations.tokenEnv,
      routes: flow.integrations.routes.map(route => ({ id: route.id, name: route.name, method: route.method, path: route.path, headers: route.headers, body: route.body })),
    } } : {}),
  };
}

function imageIds(flow: BotFlow) {
  return [...new Set(flow.menus.flatMap(menu => [menu.imageId, ...menu.options.map(option => option.imageId)]).filter((id): id is string => Boolean(id)))];
}

function validateName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !name.trim() || name.length > 100) throw new Error("O arquivo precisa ter um nome de bot com até 100 caracteres.");
}

function decodeImage(image: BotConfigurationImage): Uint8Array<ArrayBuffer> {
  if (!image || typeof image.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(image.id)
    || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType)
    || typeof image.data !== "string" || !image.data || image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
    || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
    throw new Error("O arquivo contém uma imagem inválida. Use JPEG, PNG ou WebP de até 5 MB.");
  }
  const binary = atob(image.data);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const valid = image.mimeType === "image/png"
    ? bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    : image.mimeType === "image/jpeg"
      ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid || bytes.length > MAX_IMAGE_BYTES) throw new Error("O conteúdo de uma imagem não corresponde ao formato informado.");
  return bytes;
}

export function parseBotConfiguration(text: string): BotConfiguration {
  if (new TextEncoder().encode(text).byteLength > BOT_CONFIGURATION_MAX_BYTES) throw new Error("Escolha um arquivo de configuração de até 50 MB.");
  let value: BotConfiguration;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new Error("O arquivo não contém um JSON válido de configuração do bot."); }
  if (!value || value.format !== FORMAT) throw new Error("Este arquivo não é uma configuração exportada pelo CotrimBot.");
  if (value.version !== 1) throw new Error("Esta versão do arquivo de configuração não é compatível.");
  validateName(value.name);
  validateFlow(value.draft);
  if (!Array.isArray(value.images)) throw new Error("A lista de imagens da configuração é inválida.");
  const expected = new Set(imageIds(value.draft));
  const found = new Set<string>();
  for (const image of value.images) {
    decodeImage(image);
    if (!expected.has(image.id) || found.has(image.id)) throw new Error("A configuração contém imagens repetidas ou sem vínculo com o fluxo.");
    found.add(image.id);
  }
  if (expected.size !== found.size) throw new Error("O arquivo está incompleto: faltam imagens utilizadas pelo bot.");
  return {
    format: FORMAT, version: 1, exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    name: value.name.trim(), draft: copyFlow(value.draft),
    images: value.images.map(image => ({ id: image.id, mimeType: image.mimeType, data: image.data })),
  };
}

export async function exportBotConfiguration(name: string, flow: BotFlow): Promise<string> {
  validateName(name);
  validateFlow(flow);
  const images: BotConfigurationImage[] = [];
  let bytesTotal = 0;
  for (const id of imageIds(flow)) {
    const response = await fetch(botImageUrl(id), { credentials: "include", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Não foi possível baixar todas as imagens do bot. Tente exportar novamente.");
    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("Uma imagem excede o limite de 5 MB.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
    const image = { id, mimeType: blob.type.split(";")[0]!, data: btoa(chunks.join("")) };
    decodeImage(image);
    bytesTotal += image.data.length;
    if (bytesTotal > BOT_CONFIGURATION_MAX_BYTES) throw new Error("A configuração com as imagens excede o limite de 50 MB.");
    images.push(image);
  }
  const configuration: BotConfiguration = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), name: name.trim(), draft: copyFlow(flow), images };
  const text = JSON.stringify(configuration, null, 2);
  if (new Blob([text]).size > BOT_CONFIGURATION_MAX_BYTES) throw new Error("A configuração com as imagens excede o limite de 50 MB.");
  return text;
}

export async function importBotConfiguration(configuration: BotConfiguration, members: readonly { userId: string }[], uploaded = new Map<string, string>()): Promise<BotFlow> {
  const flow = copyFlow(configuration.draft);
  for (const image of configuration.images) {
    if (uploaded.has(image.id)) continue;
    const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1];
    const file = new File([decodeImage(image)], `${image.id}.${extension}`, { type: image.mimeType });
    uploaded.set(image.id, (await uploadBotImage(file)).id);
  }
  for (const menu of flow.menus) {
    if (menu.imageId) menu.imageId = uploaded.get(menu.imageId)!;
    for (const option of menu.options) if (option.imageId) option.imageId = uploaded.get(option.imageId)!;
  }
  if (flow.assignedUserId && !members.some(member => member.userId === flow.assignedUserId)) flow.assignedUserId = "";
  if (flow.sacLookup) {
    if (flow.sacLookup.fallbackUserId && !members.some(member => member.userId === flow.sacLookup!.fallbackUserId)) flow.sacLookup.fallbackUserId = '';
    flow.sacLookup.technicians = flow.sacLookup.technicians.filter(technician => members.some(member => member.userId === technician.userId));
  }
  validateFlow(flow);
  return flow;
}

export function botConfigurationFilename(name: string): string {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${slug || "bot"}.cotrimbot.json`;
}
