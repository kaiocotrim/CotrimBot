import { test, expect } from "@playwright/test";
import type { BotFlow } from "../lib/bot-api";

for (const width of [1440, 390]) {
  test(`Central de Bots: editar, salvar e testar (${width}px)`, async ({ page }, testInfo) => {
    const saved: Record<string, unknown>[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/get-session")) {
        await route.fulfill({ json: { user: { id: "admin", name: "Administrador", email: "admin@example.invalid", role: "admin" }, session: { id: "session", userId: "admin", activeOrganizationId: "org", expiresAt: "2099-01-01T00:00:00Z" } } }); return;
      }
      if (path.endsWith("/bots/simulate")) { await route.fulfill({ json: { state: { status: "BOT_ACTIVE", menuId: "root" }, messages: [{ role: "bot", text: "Assistente Infordoc\n\n1 — Ajuda para abrir chamado\n\n0 — Voltar" }] } }); return; }
      if (path.endsWith("/bots") && route.request().method() === "POST") {
        const body = route.request().postDataJSON(); saved.push(body);
        await route.fulfill({ json: { ...body, id: "bot", revision: 0, published: null } }); return;
      }
      if (path.endsWith("/bots")) { await route.fulfill({ json: { bots: [], activeBotId: null, instanceAvailable: true } }); return; }
      await route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/dashboard/bots/");
    await page.getByRole("button", { name: "Criar bot" }).click();
    await page.getByRole("textbox", { name: "Nome do bot", exact: true }).fill("Assistente Infordoc");
    await page.getByRole("textbox", { name: "Mensagem inicial", exact: true }).fill("Assistente Infordoc\nOlá! Bem-vindo ao suporte técnico.");
    await page.getByRole("button", { name: "Adicionar opção" }).click();
    await page.getByRole("textbox", { name: "Nome da opção", exact: true }).fill("Ajuda para abrir chamado");
    await page.getByRole("textbox", { name: "Conteúdo da resposta" }).fill("Para abrir um chamado, acesse https://sac.infordoc.com.br/.");
    await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
    await expect(page.getByRole("status")).toContainText("Rascunho salvo");
    expect(saved).toHaveLength(1);
    expect((saved[0].draft as { menus: { options: { response: string }[] }[] }).menus[0].options[0].response).toContain("sac.infordoc.com.br");
    await page.screenshot({ path: testInfo.outputPath("bot-editor.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Testar bot", exact: true }).click();
    await expect(page.getByText(/nenhuma mensagem será enviada/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Simulador do bot" })).toContainText("1 — Ajuda para abrir chamado");
    expect(errors).toEqual([]);
  });
}

test("designer visual: selecionar nós, arrastar, salvar posições e abrir submenu", async ({ page }, testInfo) => {
  const draft: BotFlow = { rootMenuId: "root", backLabel: "Voltar", invalidMessage: "Selecione uma opção válida.", menus: [
    { id: "root", name: "Menu principal", text: "Olá! Bem-vindo ao suporte técnico.\n\nSelecione uma das opções abaixo:", options: [
      { id: "ticket", number: "1", label: "Ajuda para abrir chamado", action: "MESSAGE", active: true, targetMenuId: "", response: "Para abrir um chamado, acesse https://sac.infordoc.com.br/.\n\nCaso ainda não tenha um login, clique na opção Criar cadastro. Durante o cadastro, utilize o CNPJ cadastrado no contrato com a Infordoc." },
      { id: "login", number: "2", label: "Criar login", action: "MESSAGE", active: false, targetMenuId: "", response: "" },
      { id: "scanner", number: "3", label: "Scanner com problema", action: "SUBMENU", active: true, targetMenuId: "scanner-menu", response: "" },
    ] },
    { id: "scanner-menu", name: "Scanner", text: "Qual problema você está enfrentando?", options: [
      { id: "support", number: "1", label: "Falar com suporte", action: "HUMAN", active: true, targetMenuId: "", response: "Aguarde um técnico." },
    ] },
  ] };
  const saved: { draft: BotFlow }[] = [];
  let current = { id: "infordoc", name: "Assistente Infordoc", revision: 1, draft, published: draft };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/get-session")) { await route.fulfill({ json: { user: { id: "admin", name: "Administrador", email: "admin@example.invalid" }, session: { id: "session", userId: "admin", activeOrganizationId: "org", expiresAt: "2099-01-01T00:00:00Z" } } }); return; }
    if (path.endsWith("/bots/infordoc") && request.method() === "PUT") { const body = request.postDataJSON(); saved.push(body); current = { ...current, ...body, revision: current.revision + 1 }; await route.fulfill({ json: current }); return; }
    if (path.endsWith("/bots/simulate")) { await route.fulfill({ json: { state: { status: "BOT_ACTIVE", menuId: "root" }, messages: [{ role: "bot", text: "Olá! Bem-vindo ao suporte técnico.\n\n1 — Ajuda para abrir chamado\n3 — Scanner com problema\n0 — Voltar" }, { role: "user", text: "1" }, { role: "bot", text: draft.menus[0].options[0].response }] } }); return; }
    if (path.endsWith("/bots")) { await route.fulfill({ json: { bots: [current], activeBotId: "infordoc", instanceAvailable: true } }); return; }
    await route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1720, height: 1050 });
  await page.goto("/dashboard/bots/");
  await expect(page.getByRole("textbox", { name: "Mensagem inicial", exact: true })).toHaveValue(draft.menus[0].text);
  await page.getByRole("button", { name: "Ajustar", exact: true }).click();
  const messageNode = page.locator('[data-flow-node="root:message"]');
  const bounds = await messageNode.boundingBox(); expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 80, bounds!.y + 15);
  await page.mouse.down(); await page.mouse.move(bounds!.x + 125, bounds!.y + 35, { steps: 8 }); await page.mouse.up();
  await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo");
  expect(saved[0].draft.layout?.["root:message"]).toBeDefined();
  await page.getByRole("button", { name: "Editar opção 1: Ajuda para abrir chamado", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Conteúdo da resposta" })).toHaveValue(draft.menus[0].options[0].response);
  await page.getByRole("button", { name: "Testar bot", exact: true }).click();
  await expect(page.getByRole("region", { name: "Simulador do bot" })).toContainText("https://sac.infordoc.com.br/");
  await page.getByRole("button", { name: "Minimapa", exact: true }).click();
  await expect(page.getByRole("button", { name: "Navegar pelo minimapa" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("bot-designer-desktop.png"), fullPage: true });
  const palette = page.getByRole("button", { name: "Transferir para humano Encaminha para atendimento", exact: true });
  await palette.dragTo(page.getByRole("region", { name: "Designer de fluxo" }), { targetPosition: { x: 100, y: 180 } });
  await expect(page.getByRole("combobox", { name: "Tipo de ação" })).toHaveValue("HUMAN");
  await page.getByRole("textbox", { name: "Conteúdo da resposta" }).fill("Aguarde um técnico.");
  await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo");
  expect(saved[1].draft.menus[0].options).toHaveLength(4);
  const added = saved[1].draft.menus[0].options[3];
  expect(saved[1].draft.layout?.[`root:${added.id}`]).toBeDefined();
  await page.getByRole("button", { name: "Abrir submenu", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem do submenu" })).toHaveValue("Qual problema você está enfrentando?");
  await page.getByRole("button", { name: "Editar opção 1: Falar com suporte", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Tipo de ação" })).toHaveValue("HUMAN");
});
