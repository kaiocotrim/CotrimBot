import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { validateFlow } from "../../backend/src/services/bot-flow";
import { defaultSacIntegrations } from "../../backend/src/services/bot-integrations";
import { botConfigurationFilename, parseBotConfiguration, type BotConfiguration } from "../lib/bot-configuration";
import type { Bot, BotFlow } from "../lib/bot-api";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=";
function configuration(): BotConfiguration {
  const integrations = defaultSacIntegrations();
  integrations.baseUrl = "https://sac.example.invalid";
  const draft: BotFlow = {
    rootMenuId: "main", invalidMessage: "Escolha uma opção.", backLabel: "Voltar", assignedUserId: "other-company-user",
    integrations, layout: { "graph:main:menu": { x: 120, y: 80 } },
    menus: [
      { id: "main", name: "Principal", text: "Olá!", imageId: "shared-image", options: [
        { id: "support-link", number: "1", label: "Suporte", description: "Fale com a equipe", active: true, action: "SUBMENU", targetMenuId: "support", response: "" },
      ] },
      { id: "support", name: "Suporte", text: "Como podemos ajudar?", options: [
        { id: "answer", number: "1", label: "Orientações", active: true, action: "IMAGE", targetMenuId: "", response: "Veja a imagem.", imageId: "shared-image" },
      ] },
    ],
  };
  return { format: "cotrimbot.bot", version: 1, exportedAt: "2026-11-05T12:00:00.000Z", name: "Configuração recebida", draft, images: [{ id: "shared-image", mimeType: "image/png", data: png }] };
}

test("arquivo preserva fluxo e integrações e remove metadados externos", () => {
  const original = configuration();
  const result = parseBotConfiguration(JSON.stringify({ ...original, token: "must-not-transfer", draft: { ...original.draft, organizationId: "old-company", secret: "must-not-transfer" } }));
  expect(result).toEqual(original);
  expect(botConfigurationFilename("Suporte Técnico / SAC")).toBe("suporte-tecnico-sac.cotrimbot.json");
  expect(result.draft.integrations?.tokenEnv).toBe("SAC_API_TOKEN");
});

test('arquivo preserva consulta SAC e fila sem atribuição, sem importar campos extras de técnicos', () => {
  const original = configuration();
  original.draft.sacLookup = { fallbackUserId: '', technicians: [{ name: 'Tecnico SAC', userId: 'tech-local', available: true }] };
  original.draft.menus[1].options.push({ id: 'lookup', number: '2', label: 'Consultar chamado', action: 'SAC_LOOKUP', active: true, response: '', targetMenuId: '' });
  const imported = JSON.parse(JSON.stringify(original));
  imported.draft.sacLookup.technicians[0].secret = 'must-not-transfer';
  const parsed = parseBotConfiguration(JSON.stringify(imported));
  expect(parsed).toEqual(original);
  expect(parsed.draft.sacLookup?.fallbackUserId).toBe('');
});

test("importação rejeita versão incompatível, vínculos quebrados e imagens ausentes ou adulteradas", () => {
  const original = configuration();
  expect(() => parseBotConfiguration("{" )).toThrow("JSON válido");
  expect(() => parseBotConfiguration(JSON.stringify({ ...original, version: 99 }))).toThrow("não é compatível");
  const invalid = structuredClone(original);
  invalid.draft.menus[0].options[0].targetMenuId = "does-not-exist";
  expect(() => parseBotConfiguration(JSON.stringify(invalid))).toThrow("submenu existente");
  expect(() => parseBotConfiguration(JSON.stringify({ ...original, images: [] }))).toThrow("faltam imagens");
  expect(() => parseBotConfiguration(JSON.stringify({ ...original, images: [...original.images, ...original.images] }))).toThrow("repetidas");
  expect(() => parseBotConfiguration(JSON.stringify({ ...original, images: [{ ...original.images[0], mimeType: "image/jpeg" }] }))).toThrow("não corresponde");
});

async function mockBot(page: Page) {
  const draft = configuration().draft;
  draft.assignedUserId = "local-user";
  const state = {
    bot: { id: "current-bot", name: "Bot atual", revision: 7, draft, published: structuredClone(draft) } as Bot,
    imageReads: 0, uploads: 0, saves: 0, failUpload: false,
  };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/get-session")) return route.fulfill({ json: {
      user: { id: "admin", name: "Admin", email: "admin@example.invalid" },
      session: { id: "session", userId: "admin", expiresAt: "2099-01-01T00:00:00Z" },
    } });
    if (path.endsWith("/bots/images/shared-image")) {
      state.imageReads++;
      return route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") });
    }
    if (path.endsWith("/bots/images") && request.method() === "POST") {
      state.uploads++;
      if (state.failUpload) return route.fulfill({ status: 500, json: { message: "Falha ao enviar a imagem de teste." } });
      return route.fulfill({ json: { id: "restored-image" } });
    }
    if (path.endsWith("/bots/images/restored-image")) return route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") });
    if (path.endsWith("/bots/current-bot") && request.method() === "PUT") {
      const body = request.postDataJSON();
      validateFlow(body.draft);
      expect(body.revision).toBe(state.bot.revision);
      state.saves++;
      state.bot = { ...state.bot, name: body.name, draft: body.draft, revision: state.bot.revision + 1 };
      return route.fulfill({ json: state.bot });
    }
    if (path.endsWith("/bots")) return route.fulfill({ json: { bots: [state.bot], activeBotId: null, instanceAvailable: true, members: [{ userId: "local-user", name: "Membro local" }] } });
    if (path.endsWith("/publish")) throw new Error("Importar não pode publicar o bot.");
    return route.fulfill({ json: {} });
  });
  await page.goto("/dashboard/bots/");
  await expect(page.getByRole("button", { name: "Exportar configuração do bot", exact: true })).toBeEnabled();
  return { state, errors };
}

async function chooseConfiguration(page: Page, value: unknown) {
  await page.locator("input[data-bot-import]").setInputFiles({ name: "bot.cotrimbot.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
}

for (const width of [1280, 390]) {
  test(`exporta rascunho e importa imagens, menus e integrações com confirmação (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, errors } = await mockBot(page);
    const published = structuredClone(state.bot.published);
    await page.getByRole("tab", { name: "Configurações", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome do bot", exact: true }).fill("Nome ainda não salvo");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar configuração do bot", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("nome-ainda-nao-salvo.cotrimbot.json");
    const exported = parseBotConfiguration(await readFile((await download.path())!, "utf8"));
    expect(exported.name).toBe("Nome ainda não salvo");
    expect(exported.draft).toEqual(state.bot.draft);
    expect(exported.images).toEqual(configuration().images);
    expect(state.saves).toBe(0);

    await chooseConfiguration(page, configuration());
    const dialog = page.getByRole("dialog", { name: "Importar configuração do bot", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Configuração recebida");
    await expect(dialog).toContainText("membro atribuído no arquivo não está nesta empresa");
    await page.screenshot({ path: testInfo.outputPath(`import-preview-${width}.png`), fullPage: true });
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Nome do bot", exact: true })).toHaveValue("Nome ainda não salvo");
    expect(state.uploads).toBe(0);

    await chooseConfiguration(page, configuration());
    await dialog.getByRole("button", { name: "Importar para o rascunho", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toContainText("Configuração importada");
    expect(state.uploads).toBe(1);
    expect(state.saves).toBe(0);
    await page.getByRole("tab", { name: "Configurações", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Nome do bot", exact: true })).toHaveValue("Configuração recebida");
    await page.getByRole("button", { name: /^Salvar rascunho/ }).last().click();
    await expect.poll(() => state.saves).toBe(1);
    const expected = configuration().draft;
    expected.assignedUserId = "";
    expected.menus[0].imageId = "restored-image";
    expected.menus[1].options[0].imageId = "restored-image";
    expect(state.bot.draft).toEqual(expected);
    expect(state.bot.published).toEqual(published);
    expect(errors).toEqual([]);
  });
}

test("arquivo inválido e falha no upload não alteram o rascunho; permite tentar novamente", async ({ page }) => {
  const { state, errors } = await mockBot(page);
  const original = structuredClone(state.bot);
  await chooseConfiguration(page, { format: "wrong" });
  await expect(page.getByRole("status")).toContainText("não é uma configuração exportada");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  state.failUpload = true;
  await chooseConfiguration(page, configuration());
  const dialog = page.getByRole("dialog", { name: "Importar configuração do bot", exact: true });
  await dialog.getByRole("button", { name: "Importar para o rascunho", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Falha ao enviar");
  expect(state.bot).toEqual(original);
  expect(state.saves).toBe(0);
  state.failUpload = false;
  await dialog.getByRole("button", { name: "Importar para o rascunho", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Exportar configuração do bot", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nome do bot", exact: true })).toHaveValue("Bot atual");
  expect(state.bot).toEqual(original);
  expect(errors).toEqual([]);
});

test("desfazer restaura o nome quando a configuração importada tem o mesmo fluxo", async ({ page }) => {
  const { state, errors } = await mockBot(page);
  const incoming = configuration();
  incoming.images = [];
  delete incoming.draft.menus[0].imageId;
  delete incoming.draft.menus[1].options[0].imageId;
  incoming.draft.assignedUserId = "local-user";
  state.bot.draft = parseBotConfiguration(JSON.stringify(incoming)).draft;
  await page.reload();
  await chooseConfiguration(page, incoming);
  await page.getByRole("button", { name: "Importar para o rascunho", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Configuração importada");
  await page.getByRole("button", { name: "Exportar configuração do bot", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nome do bot", exact: true })).toHaveValue("Bot atual");
  expect(state.saves).toBe(0);
  expect(state.uploads).toBe(0);
  expect(errors).toEqual([]);
});
