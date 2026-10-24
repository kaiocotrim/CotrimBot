import { test, expect, type Locator } from "@playwright/test";
import type { BotFlow } from "../lib/bot-api";
import { advanceBot, validateFlow } from "../../backend/src/services/bot-flow";
import { connectBotOption, graphNodes } from '../lib/bot-graph';

async function selectChoice(trigger: Locator, value: string) {
  await trigger.click();
  await trigger.page().getByRole("option").and(trigger.page().locator(`[data-value="${value}"]`)).click();
}

test('modelo visual preserva execução, rejeita destinos inválidos e ações terminais', () => {
  const flow: BotFlow = { rootMenuId: 'root', invalidMessage: 'Opção inválida.', backLabel: 'Voltar', menus: [
    { id: 'root', name: 'Principal', text: 'Olá', options: [{ id: 'terminal', number: '1', label: 'Encerrar', action: 'CLOSE', active: true, response: 'Até logo', targetMenuId: '' }] },
  ] };
  expect(() => connectBotOption(flow, 'terminal', 'root')).toThrow('não permite');
  expect(() => connectBotOption(flow, 'terminal', 'inexistente')).toThrow('inexistente');
  expect(graphNodes(flow).map(node => node.id)).toEqual(['graph:root:menu', 'graph:root:terminal']);
});

test('visão geral conecta pelos pontos, salva o fluxo e mantém a navegação do bot', async ({ page }, testInfo) => {
  const original: BotFlow = { rootMenuId: 'root', invalidMessage: 'Opção inválida.', backLabel: 'Voltar', layout: { 'root:message': { x: 200, y: 100 } }, menus: [
    { id: 'root', name: 'Principal', text: 'Olá! Escolha uma opção.', options: [{ id: 'ticket', number: '1', label: 'Suporte', action: 'MESSAGE', active: true, response: 'Resposta anterior', targetMenuId: '' }] },
    { id: 'support', name: 'Atendimento', text: 'Como podemos ajudar?', options: [] },
  ] };
  let current = { id: 'graph-bot', name: 'TEC', draft: original, published: structuredClone(original), revision: 1 };
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/get-session')) return route.fulfill({ json: { user: { id: 'admin', name: 'Admin', email: 'admin@example.invalid' }, session: { id: 'session', userId: 'admin', expiresAt: '2099-01-01T00:00:00Z' } } });
    if (path.endsWith('/bots/graph-bot') && req.method() === 'PUT') { const body = req.postDataJSON(); validateFlow(body.draft, true); current = { ...current, ...body, revision: current.revision + 1 }; return route.fulfill({ json: current }); }
    if (path.endsWith('/bots')) return route.fulfill({ json: { bots: [current], activeBotId: null, instanceAvailable: true } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1720, height: 1050 });
  await page.goto('/dashboard/bots/');
  await selectChoice(page.getByRole('combobox', { name: 'Modo de visualização', exact: true }), 'overview');
  const graph = page.getByRole('region', { name: 'Visão geral do fluxo', exact: true });
  await expect(graph).toBeVisible();
  const output = graph.getByRole('button', { name: 'Conectar saída da opção 1 de Principal', exact: true });
  const input = graph.getByRole('button', { name: 'Entrada do menu Atendimento', exact: true });
  const a = (await output.boundingBox())!, b = (await input.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(page.getByRole('combobox', { name: 'Tipo de ação' })).toHaveAttribute("data-value", 'SUBMENU');
  await page.getByRole('button', { name: /^Salvar rascunho/ }).click();
  await expect.poll(() => current.draft.menus[0].options[0].targetMenuId).toBe('support');
  expect(current.published).toEqual(original);
  const reply = advanceBot(current.draft, advanceBot(current.draft, null, 'Oi').state, '1');
  expect(reply.text).toContain('Como podemos ajudar?');
  const node = graph.locator('[data-graph-node="graph:root:ticket"]');
  const position = (await node.boundingBox())!;
  await page.mouse.move(position.x + 70, position.y + 25); await page.mouse.down();
  await page.mouse.move(position.x + 115, position.y + 55, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: /^Salvar rascunho/ }).click();
  await expect.poll(() => current.draft.layout?.['graph:root:ticket']).toBeDefined();
  expect(current.draft.layout?.['root:message']).toEqual({ x: 200, y: 100 });
  await selectChoice(page.getByRole('combobox', { name: 'Modo de visualização', exact: true }), 'menu');
  await expect(page.getByRole('region', { name: 'Designer de fluxo', exact: true })).toBeVisible();
  await selectChoice(page.getByRole('combobox', { name: 'Modo de visualização', exact: true }), 'overview');
  await expect(graph).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('visao-geral-desktop.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Modo de visualização', exact: true })).toHaveAttribute("data-value", 'overview');
  await expect(graph.getByRole('button', { name: 'Selecionar ligação Suporte para Atendimento', exact: true })).toBeVisible();
  // Remover pela linha e reconectar pelos pontos com teclado.
  await graph.getByRole('button', { name: 'Selecionar ligação Suporte para Atendimento', exact: true }).focus(); await page.keyboard.press('Enter');
  await graph.getByRole('button', { name: 'Remover ligação', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Tipo de ação' })).toHaveAttribute("data-value", 'MESSAGE');
  await output.focus(); await page.keyboard.press('Enter'); await input.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Tipo de ação' })).toHaveAttribute("data-value", 'SUBMENU');
  await graph.getByRole('button', { name: 'Tela cheia', exact: true }).click();
  const expanded = page.getByRole('dialog', { name: 'Visão geral ampliada', exact: true });
  await expect(expanded).toBeVisible();
  await expanded.getByRole('button', { name: 'Editar menu Principal', exact: true }).click();
  await expect(expanded.getByRole('textbox', { name: 'Mensagem inicial', exact: true })).toHaveValue(original.menus[0].text);
  await expanded.getByRole('button', { name: 'Fechar visão geral', exact: true }).click();
  await expect(expanded).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('visao-geral-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('aba Integrações salva quatro operações e exibe prévia de GET e POST', async ({ page }, testInfo) => {
  let current: any = { id: 'integration-bot', name: 'SAC', revision: 1, published: null, draft: { rootMenuId: 'root', invalidMessage: 'Escolha uma opção.', backLabel: 'Voltar', menus: [{ id: 'root', name: 'Principal', text: 'Olá!', options: [] }] } };
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/get-session')) return route.fulfill({ json: { user: { id: 'admin', name: 'Admin', email: 'admin@example.invalid' }, session: { id: 'session', userId: 'admin', expiresAt: '2099-01-01T00:00:00Z' } } });
    if (path.endsWith('/bots/integration-bot') && req.method() === 'PUT') {
      const body = req.postDataJSON(); validateFlow(body.draft); current = { ...current, ...body, revision: current.revision + 1 };
      return route.fulfill({ json: current });
    }
    if (path.endsWith('/bots')) return route.fulfill({ json: { bots: [current], activeBotId: null, instanceAvailable: true } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/dashboard/bots/');
  await page.getByRole('tab', { name: 'Integrações', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Integrações do chamado' });
  await expect(page.getByRole('heading', { name: 'Componentes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar nó', exact: true })).toHaveCount(0);
  await expect(page.locator('select')).toHaveCount(0);
  await panel.getByRole('tab', { name: 'Como usar', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Da configuração à prévia' })).toBeVisible();
  await expect(panel).toContainText('Nenhuma chamada é enviada');
  await panel.getByRole('button', { name: 'Começar a configurar' }).click();
  await selectChoice(panel.getByRole('combobox', { name: 'Método HTTP', exact: true }), 'PATCH');
  await expect(panel.getByLabel('Corpo da requisição (JSON)', { exact: true })).toBeVisible();
  await selectChoice(panel.getByRole('combobox', { name: 'Método HTTP', exact: true }), 'GET');
  await expect(panel.getByLabel('Corpo da requisição (JSON)', { exact: true })).toHaveCount(0);
  await panel.getByLabel('URL base da API', { exact: true }).fill('https://api.example.com/v1');
  await panel.getByRole('button', { name: 'Visualizar requisição' }).click();
  await expect(panel).toContainText('https://api.example.com/v1/empresas?cnpj=05540238000123');
  await panel.getByRole('button', { name: /4\. Criar chamado/ }).click();
  await expect(panel.getByRole('combobox', { name: 'Método HTTP', exact: true })).toHaveAttribute('data-value', 'POST');
  await panel.getByLabel('Rota', { exact: true }).fill('/tickets');
  await panel.getByRole('button', { name: 'Visualizar requisição' }).click();
  await expect(panel).toContainText('https://api.example.com/v1/tickets');
  await panel.getByRole('button', { name: 'Salvar integrações no rascunho' }).click();
  await expect(page.getByRole('status')).toContainText('Rascunho salvo');
  expect(current.draft.integrations.routes).toHaveLength(4);
  expect(current.published).toBeNull();
  await page.reload();
  await page.getByRole('tab', { name: 'Integrações', exact: true }).click();
  await expect(panel.getByLabel('URL base da API')).toHaveValue('https://api.example.com/v1');
  await panel.getByRole('button', { name: /4\. Criar chamado/ }).click();
  await expect(panel.getByLabel('Rota', { exact: true })).toHaveValue('/tickets');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('integrations-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.getByRole('button', { name: 'Visualizar requisição' }).click();
  await expect(panel.getByRole('heading', { name: 'Confira antes de salvar' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('integrations-desktop.png'), fullPage: true });
});

test('opção de chamado de teste pode ser configurada e executada no simulador existente', async ({ page }) => {
  const draft: BotFlow = { rootMenuId: 'root', backLabel: 'Voltar', invalidMessage: 'Escolha uma opção válida.', menus: [
    { id: 'root', name: 'Principal', text: 'Suporte técnico', options: [
      { id: 'ticket', number: '1', label: 'Abrir chamado', active: true, action: 'MESSAGE', response: 'Resposta anterior', targetMenuId: '' },
    ] },
  ] };
  let saved: BotFlow | undefined;
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/get-session')) return route.fulfill({ json: { user: { id: 'admin', name: 'Admin', email: 'admin@example.invalid' }, session: { id: 'session', userId: 'admin', activeOrganizationId: 'org', expiresAt: '2099-01-01T00:00:00Z' } } });
    if (path.endsWith('/bots/demo') && request.method() === 'PUT') {
      const body = request.postDataJSON(); validateFlow(body.draft, true); saved = body.draft;
      return route.fulfill({ json: { ...body, id: 'demo', revision: 2, published: null } });
    }
    if (path.endsWith('/bots/simulate')) {
      const body = request.postDataJSON();
      let result = advanceBot(body.flow, null, '');
      const messages = [{ role: 'bot', text: result.text }];
      for (const input of body.inputs) {
        messages.push({ role: 'user', text: input }); result = advanceBot(body.flow, result.state, input);
        messages.push({ role: 'bot', text: result.text });
      }
      return route.fulfill({ json: { state: result.state, messages, quickReplies: ['0'] } });
    }
    if (path.endsWith('/bots')) return route.fulfill({ json: { bots: [{ id: 'demo', name: 'Suporte', draft, published: null, revision: 1 }], activeBotId: null, instanceAvailable: true } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1720, height: 1050 });
  await page.goto('/dashboard/bots/');
  await page.getByRole('button', { name: 'Editar opção 1: Abrir chamado', exact: true }).click();
  await selectChoice(page.getByRole('combobox', { name: 'Tipo de ação' }), 'SAC_TEST');
  await expect(page.getByText('Coleta CNPJ, nome, telefone', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /^Salvar rascunho/ }).click();
  await expect.poll(() => saved?.menus[0]?.options[0]?.action).toBe('SAC_TEST');
  await page.getByRole('button', { name: 'Testar esta opção', exact: true }).click();
  await expect(page.getByText('Você está em:', { exact: false })).toContainText('cnpj');
  const composer = page.getByRole('textbox', { name: 'Mensagem de teste', exact: true });
  for (const [input, step] of [
    ['05540238000123', 'confirmCnpj'], ['1', 'requester'], ['Pessoa Teste', 'phone'], ['27999999999', 'address'],
    ['1', 'email'], ['teste@example.com', 'equipment'], ['1', 'description'], ['Problema com scanner', 'review'],
  ]) {
    await composer.fill(input!); await page.getByRole('button', { name: 'Enviar mensagem de teste', exact: true }).click();
    await expect(page.getByText('Você está em:', { exact: false })).toContainText(step!);
  }
  await expect(page.getByText('Resumo do chamado — TESTE', { exact: false })).toBeVisible();
});

test("botão direito na mensagem 4 cria o menu de opções ligado a ela", async ({ page }) => {
  const draft: BotFlow = { rootMenuId: "root", backLabel: "Voltar", invalidMessage: "Escolha uma opção válida.", menus: [
    { id: "root", name: "Principal", text: "Escolha o assunto", options: [
      { id: "other", number: "1", label: "Outro assunto", active: true, action: "MESSAGE", targetMenuId: "", response: "Outra resposta" },
      { id: "scanner", number: "4", label: "Problemas com scanner", active: true, action: "MESSAGE", targetMenuId: "", response: "Qual problema ocorre no scanner?", imageId: "scanner-photo" },
    ] },
  ] };
  let saved: BotFlow | undefined;
  await page.route("**/api/**", async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/auth/get-session")) {
      await route.fulfill({ json: { user: { id: "admin", name: "Administrador", email: "admin@example.invalid" }, session: { id: "session", userId: "admin", activeOrganizationId: "org", expiresAt: "2099-01-01T00:00:00Z" } } }); return;
    }
    if (pathname.endsWith("/bots/scanner") && request.method() === "PUT") {
      const body = request.postDataJSON();
      validateFlow(body.draft);
      saved = body.draft;
      await route.fulfill({ json: { ...body, id: "scanner", revision: body.revision + 1, published: null } }); return;
    }
    if (pathname.endsWith("/bots")) {
      await route.fulfill({ json: { bots: [{ id: "scanner", name: "Suporte", revision: 1, draft, published: null }], activeBotId: null, instanceAvailable: true } }); return;
    }
    if (pathname.endsWith("/bots/images/scanner-photo")) {
      await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") }); return;
    }
    await route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1720, height: 1050 });
  await page.goto("/dashboard/bots/");
  await selectChoice(page.getByRole("combobox", { name: "Modo de visualização", exact: true }), "menu");
  await page.getByRole("button", { name: "Editar opção 1: Outro assunto", exact: true }).click();
  await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
  const expanded = page.getByRole("dialog", { name: "Visualização ampliada do fluxo" });
  await expanded.getByRole("button", { name: "Editar opção 4: Problemas com scanner", exact: true }).click({ button: "right" });
  const context = page.getByRole("menu", { name: "Opções do fluxo" });
  await expect(context.getByRole("menuitem", { name: "Adicionar submenu", exact: true })).toHaveCount(0);
  await context.getByRole("menuitem", { name: "Menu de opções", exact: true }).click();
  await expect(context).toHaveCount(0);
  await expect(expanded.getByRole("textbox", { name: "Nome do menu", exact: true })).toHaveValue("Problemas com scanner");
  await expect(expanded.getByRole("textbox", { name: "Mensagem do submenu" })).toHaveValue("Qual problema ocorre no scanner?");
  await expect(expanded.getByRole("img", { name: "Prévia da imagem do bot" })).toHaveAttribute("src", /\/bots\/images\/scanner-photo$/);
  await expanded.getByRole("button", { name: /^Salvar rascunho/ }).click();
  await expect(expanded.getByRole("status")).toContainText("Rascunho salvo");
  expect(saved!.menus).toHaveLength(2);
  expect(saved!.menus[0].options).toHaveLength(2);
  expect(saved!.menus[0].options[0].action).toBe("MESSAGE");
  const parent = saved!.menus[0].options[1];
  expect(parent).toMatchObject({ id: "scanner", number: "4", action: "SUBMENU" });
  expect(parent.targetMenuId).toBe(saved!.menus[1].id);
  validateFlow(saved!, true);
  const reply = advanceBot(saved!, advanceBot(saved!, null, "Oi").state, "4");
  expect(reply.state.menuId).toBe(parent.targetMenuId);
  expect(reply.text).toContain("Qual problema ocorre no scanner?");
  expect(reply.imageId).toBe("scanner-photo");
  await expanded.getByRole("button", { name: "Editar opções", exact: true }).click();
  await expanded.getByRole("region", { name: "Editar nó", exact: true }).getByRole("button", { name: "Adicionar opção", exact: true }).click();
  await expanded.getByRole("textbox", { name: "Nome da opção", exact: true }).fill("Voltar ao início");
  await selectChoice(expanded.getByRole("combobox", { name: "Tipo de ação" }), "SUBMENU");
  const destination = expanded.getByRole("combobox", { name: "Menu de destino" });
  await destination.click();
  await expect(page.getByRole("option", { name: "Principal — voltar ao início", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Principal — voltar ao início", exact: true }).click();
  await expanded.getByRole("button", { name: /^Salvar rascunho/ }).click();
  await expect(expanded.getByRole("status")).toContainText("Rascunho salvo");
  validateFlow(saved!, true);
  const entered = advanceBot(saved!, advanceBot(saved!, null, "Oi").state, "4");
  const returned = advanceBot(saved!, entered.state, "1");
  expect(returned.state.menuId).toBe("root");
  expect(returned.state.stack).toEqual([]);
  expect(returned.text).toContain("Escolha o assunto");
  await selectChoice(expanded.getByRole("combobox", { name: "Menu do fluxo" }), "root");
  await expanded.getByRole("button", { name: "Editar opção 4: Problemas com scanner", exact: true }).click({ button: "right" });
  await context.getByRole("menuitem", { name: "Abrir menu de opções", exact: true }).click();
  await expect(expanded.getByRole("textbox", { name: "Nome do menu", exact: true })).toHaveValue("Problemas com scanner");
});

for (const width of [1440, 390]) {
  test(`Central de Bots: editar, salvar e testar (${width}px)`, async ({ page }, testInfo) => {
    const saved: Record<string, unknown>[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && message.text().includes('unique "key"')) errors.push(message.text());
    });
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
      if (path.endsWith("/bots/bot") && route.request().method() === "PUT") {
        const body = route.request().postDataJSON(); saved.push(body);
        await route.fulfill({ json: { ...body, id: "bot", revision: body.revision + 1, published: null } }); return;
      }
      if (path.endsWith("/bots")) { await route.fulfill({ json: { bots: [], activeBotId: null, instanceAvailable: true } }); return; }
      await route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/dashboard/bots/");
  await selectChoice(page.getByRole("combobox", { name: "Modo de visualização", exact: true }), "menu");
    await expect(page.getByRole("heading", { name: "Bots da empresa", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Criar bot", exact: true })).toHaveCount(0);
    const components = page.getByRole("button", { name: "Componentes", exact: true });
    await components.click();
    await expect(components).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: /Menu de opções Cria/ })).toHaveCount(0);
    const menus = page.getByRole("button", { name: "Menus do fluxo", exact: true });
    await menus.click();
    await expect(page.getByRole("textbox", { name: "Buscar menu", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(components).toHaveAttribute("aria-expanded", "false");
    await expect(menus).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: /Menu de opções Cria/ })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Buscar menu", exact: true })).toHaveCount(0);
    await components.click();
    await expect(page.getByRole("button", { name: /Menu de opções Cria/ })).toBeVisible();
    await menus.click();
    await page.reload();
    await expect(components).toHaveAttribute("aria-expanded", "true");
    await expect(menus).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("textbox", { name: "Buscar menu", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Editar nó", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome do bot", exact: true }).fill("Assistente Infordoc");
    await page.getByRole("textbox", { name: "Mensagem inicial", exact: true }).fill("Assistente Infordoc\nOlá! Bem-vindo ao suporte técnico.");
    await page.getByRole("button", { name: "Adicionar opção" }).click();
    await page.getByRole("textbox", { name: "Nome da opção", exact: true }).fill("Ajuda para abrir chamado");
    await page.getByRole("textbox", { name: "Conteúdo da resposta" }).fill("Para abrir um chamado, acesse https://sac.infordoc.com.br/.");
    await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
    await expect(page.getByRole("status")).toContainText("Rascunho salvo");
    expect(saved).toHaveLength(1);
    expect((saved[0].draft as { menus: { options: { response: string }[] }[] }).menus[0].options[0].response).toContain("sac.infordoc.com.br");
    await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
    const expandedFlow = page.getByRole("dialog", { name: "Visualização ampliada do fluxo" });
    await expect(expandedFlow).toBeVisible();
    await expect(expandedFlow.getByRole("region", { name: "Designer de fluxo" })).toBeVisible();
    const closeBounds = await expandedFlow.getByRole("button", { name: "Fechar visualização do fluxo" }).boundingBox();
    expect(closeBounds!.x).toBeGreaterThanOrEqual(0);
    expect(closeBounds!.x + closeBounds!.width).toBeLessThanOrEqual(width);
    await expect(expandedFlow.getByRole("button", { name: "Adicionar opção", exact: true })).toBeVisible();
    const expandedBounds = await expandedFlow.boundingBox();
    expect(expandedBounds!.width).toBe(width);
    expect(expandedBounds!.height).toBe(1000);
    await page.screenshot({ path: testInfo.outputPath("bot-flow-expanded.png") });
    await expandedFlow.getByRole("button", { name: "Editar opção 1: Ajuda para abrir chamado", exact: true }).click();
    const expandedEditor = expandedFlow.getByRole("region", { name: "Editar nó", exact: true });
    await expect(expandedEditor).toBeVisible();
    await expandedEditor.getByRole("textbox", { name: "Conteúdo da resposta" }).fill("Resposta editada na tela ampliada.");
    await expandedEditor.getByRole("button", { name: /^Salvar rascunho/ }).click();
    await expect(expandedEditor.getByRole("status")).toContainText("Rascunho salvo");
    expect(saved).toHaveLength(2);
    expect((saved[1].draft as BotFlow).menus[0].options[0].response).toBe("Resposta editada na tela ampliada.");
    const editorCloseBounds = await expandedFlow.getByRole("button", { name: "Fechar visualização do fluxo" }).boundingBox();
    expect(editorCloseBounds!.x + editorCloseBounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath("bot-flow-expanded-editor.png") });
    await expandedEditor.getByRole("button", { name: "Criar menu de opções", exact: true }).click();
    await expect(expandedEditor.getByRole("textbox", { name: "Nome do menu", exact: true })).toHaveValue("Ajuda para abrir chamado");
    await expect(expandedEditor.getByRole("textbox", { name: "Mensagem do submenu" })).toHaveValue("Resposta editada na tela ampliada.");
    await expandedEditor.getByRole("textbox", { name: "Mensagem do submenu" }).fill("Escolha o assunto do atendimento:");
    await expandedEditor.getByRole("button", { name: "Editar opções", exact: true }).click();
    await expandedEditor.getByRole("button", { name: "Adicionar opção", exact: true }).click();
    await expandedEditor.getByRole("textbox", { name: "Nome da opção", exact: true }).fill("Suporte");
    await expandedEditor.getByRole("textbox", { name: "Conteúdo da resposta" }).fill("Resposta do submenu.");
    await expandedEditor.getByRole("button", { name: /^Salvar rascunho/ }).click();
    await expect(expandedEditor.getByRole("status")).toContainText("Rascunho salvo");
    const connectedFlow = saved[2].draft as BotFlow;
    validateFlow(connectedFlow, true);
    const parentOption = connectedFlow.menus[0].options[0];
    expect(parentOption.action).toBe("SUBMENU");
    expect(parentOption.number).toBe("1");
    const greeting = advanceBot(connectedFlow, null, "Oi");
    const submenu = advanceBot(connectedFlow, greeting.state, "1");
    expect(submenu.state.menuId).toBe(parentOption.targetMenuId);
    expect(submenu.text).toContain("1 — Suporte");
    expect(advanceBot(connectedFlow, submenu.state, "1").text).toContain("Resposta do submenu.");
    expect(advanceBot(connectedFlow, submenu.state, "0").state.menuId).toBe("root");
    await page.screenshot({ path: testInfo.outputPath("bot-option-submenu.png") });
    await page.keyboard.press("Escape");
    await expect(expandedFlow).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tela cheia", exact: true })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Conteúdo da resposta" })).toHaveValue("Resposta do submenu.");
    await page.screenshot({ path: testInfo.outputPath("bot-editor.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Testar bot", exact: true }).click();
    await expect(page.getByText(/nenhuma mensagem será enviada/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Simulador do bot" })).toContainText("1 — Ajuda para abrir chamado");
    const simulator = page.getByRole("region", { name: "Simulador do bot" });
    const phone = simulator.getByRole("group", { name: "Prévia de iPhone Pro Max" });
    await expect(phone).toBeVisible();
    const phoneBox = (await phone.boundingBox())!;
    expect(phoneBox.width / phoneBox.height).toBeCloseTo(1320 / 2868, 3);
    expect(phoneBox.x).toBeGreaterThanOrEqual(0);
    expect(phoneBox.y).toBeGreaterThanOrEqual(0);
    expect(phoneBox.x + phoneBox.width).toBeLessThanOrEqual(width);
    expect(phoneBox.y + phoneBox.height).toBeLessThanOrEqual(1000);
    await expect(phone.getByRole("textbox", { name: "Mensagem de teste" })).toBeVisible();
    await expect(phone.getByText("Hoje", { exact: true })).toBeVisible();
    await phone.getByRole("button", { name: "Emojis do teste", exact: true }).click();
    await phone.getByRole("group", { name: "Emojis do teste", exact: true }).getByRole("button", { name: "Inserir 👋", exact: true }).click();
    await expect(phone.getByRole("textbox", { name: "Mensagem de teste" })).toHaveValue("👋");
    await phone.getByRole("button", { name: "Emojis do teste", exact: true }).click();
    await phone.getByRole("textbox", { name: "Mensagem de teste" }).fill("");
    await phone.getByRole("button", { name: "Ocultar respostas rápidas", exact: true }).click();
    await expect(phone.getByRole("button", { name: "Mostrar respostas rápidas", exact: true })).toHaveAttribute("aria-expanded", "false");
    await phone.getByRole("button", { name: "Mostrar respostas rápidas", exact: true }).click();
    await simulator.getByRole("tab", { name: "Histórico do teste" }).click();
    await expect(simulator).toContainText("1 — Ajuda para abrir chamado");
    await simulator.getByRole("tab", { name: "Teste do bot", exact: true }).click();
    await expect(phone).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("simulador-iphone.png") });
    await page.setViewportSize({ width, height: 720 });
    await expect.poll(async () => {
      const box = (await phone.boundingBox())!;
      return Math.abs(box.width / box.height - 1320 / 2868) < .001 && box.y >= 0 && box.y + box.height <= 720;
    }).toBe(true);
    const compactPhone = (await phone.boundingBox())!;
    expect(compactPhone.width).toBeLessThan(phoneBox.width);
    await expect(phone.getByRole("textbox", { name: "Mensagem de teste" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("simulador-iphone-baixo.png") });
    await page.setViewportSize({ width, height: 1000 });
    await expect(simulator.getByRole("button", { name: "Fechar teste", exact: true })).toHaveCount(0);
    const closeFrames = page.evaluate(() => new Promise<string[]>(resolve => {
      const frames: string[] = [];
      const start = performance.now();
      function sample() {
        const panel = document.querySelector("[data-bot-test-panel]");
        if (!panel) { resolve(frames); return; }
        const style = getComputedStyle(panel);
        frames.push(style.transform);
        if (style.visibility === "hidden" || performance.now() - start > 2000) { resolve(frames); return; }
        requestAnimationFrame(sample);
      }
      sample();
    }));
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    expect(new Set(await closeFrames).size).toBeGreaterThan(3);
    await expect(simulator).toBeHidden();
    await page.getByRole("button", { name: "Testar bot", exact: true }).click();
    await expect(simulator).toBeVisible();
    await expect(simulator).toContainText("1 — Ajuda para abrir chamado");
    await page.getByRole("button", { name: "Fechar teste", exact: true }).click();
    await page.getByRole("button", { name: "Editar Mensagem", exact: true }).click();
    await page.getByRole("button", { name: "Menu de opções Cria um novo submenu", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome do menu", exact: true }).fill("Menu sem uso");
    await page.getByRole("region", { name: "Menus do fluxo", exact: true }).getByRole("button", { name: "Ver menu Menu principal", exact: true }).click();
    await page.getByRole("dialog", { name: "Menu principal", exact: true }).getByRole("button", { name: "Editar menu", exact: true }).click();
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText('Sem conexão › Menu sem uso');
    await expect(page.getByRole("textbox", { name: "Nome do menu", exact: true })).toHaveValue("Menu sem uso");
    await expect(page.getByRole("textbox", { name: "Mensagem do submenu" })).toBeFocused();
    expect(saved).toHaveLength(3);
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
  await selectChoice(page.getByRole("combobox", { name: "Modo de visualização", exact: true }), "menu");
  await page.getByRole('button', { name: 'Editar Mensagem', exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem inicial", exact: true })).toHaveValue(draft.menus[0].text);
  const menuList = page.getByRole("region", { name: "Menus do fluxo", exact: true });
  const scannerMenuButton = menuList.getByRole("button", { name: "Ver menu Menu principal › Scanner", exact: true });
  await menuList.getByRole("button", { name: "Recolher Menu principal", exact: true }).click();
  await expect(scannerMenuButton).toHaveCount(0);
  await menuList.getByRole("button", { name: "Expandir Menu principal", exact: true }).click();
  await expect(scannerMenuButton).toBeVisible();
  await scannerMenuButton.click();
  const menuDetails = page.getByRole("dialog", { name: "Scanner", exact: true });
  await expect(menuDetails).toBeVisible();
  await expect(menuDetails.getByLabel("Caminho do menu")).toHaveText("Menu principal › Scanner");
  await expect(menuDetails).toContainText("3 — Scanner com problema");
  await expect(menuDetails).toContainText("Qual problema você está enfrentando?");
  await expect(menuDetails).toContainText("Falar com suporte");
  await expect(menuDetails).toContainText("Transfere para um atendente");
  await page.screenshot({ path: testInfo.outputPath("menu-details-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const cardBounds = (await menuDetails.boundingBox())!;
  expect(cardBounds.x).toBeGreaterThanOrEqual(0);
  expect(cardBounds.x + cardBounds.width).toBeLessThanOrEqual(390);
  expect(cardBounds.y).toBeGreaterThanOrEqual(0);
  expect(cardBounds.y + cardBounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath("menu-details-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(menuDetails).toHaveCount(0);
  await page.setViewportSize({ width: 1720, height: 1050 });
  await expect(scannerMenuButton).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Mensagem inicial", exact: true })).toHaveValue(draft.menus[0].text);
  await scannerMenuButton.click();
  await menuDetails.getByRole("button", { name: "Editar menu", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem do submenu" })).toHaveValue(draft.menus[1].text);
  await menuList.getByRole("button", { name: "Ver menu Menu principal", exact: true }).click();
  const rootDetails = page.getByRole("dialog", { name: "Menu principal", exact: true });
  await expect(rootDetails).toContainText("Este é o primeiro menu");
  await expect(rootDetails).toContainText("Inativa · não aparece para o cliente");
  await rootDetails.getByRole("button", { name: "Ver menu Scanner", exact: true }).click();
  await expect(menuDetails).toBeVisible();
  await page.keyboard.press("Escape");
  await menuList.getByRole("button", { name: "Ver menu Menu principal", exact: true }).click();
  await rootDetails.getByRole("button", { name: "Editar menu", exact: true }).click();
  await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Visualização ampliada do fluxo" })).toBeVisible();
  const expandedMessage = page.locator('[data-flow-node="root:message"]');
  const canvasViewport = page.locator('[data-flow-viewport]');
  const viewportBounds = (await canvasViewport.boundingBox())!;
  const beforePan = (await expandedMessage.boundingBox())!;
  await expandedMessage.click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "Opções do fluxo" });
  await expect(contextMenu.getByRole("menuitem", { name: "Editar nó", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contextMenu).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Visualização ampliada do fluxo" })).toBeVisible();
  expect((await expandedMessage.boundingBox())!.x).toBeCloseTo(beforePan.x, 0);
  await expandedMessage.click({ button: "right" });
  await contextMenu.getByRole("menuitem", { name: "Editar nó", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Mensagem inicial", exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Visualização ampliada do fluxo' }).getByRole("button", { name: "Ocultar edição", exact: true }).click();
  const zoomPoint = { x: beforePan.x + beforePan.width / 2, y: beforePan.y + beforePan.height / 2 };
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await expandedMessage.boundingBox())!.width).toBeGreaterThan(beforePan.width);
  const zoomed = (await expandedMessage.boundingBox())!;
  expect(zoomed.x + zoomed.width / 2).toBeCloseTo(zoomPoint.x, 0);
  expect(zoomed.y + zoomed.height / 2).toBeCloseTo(zoomPoint.y, 0);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => Math.abs((await expandedMessage.boundingBox())!.width - beforePan.width)).toBeLessThan(1);
  await expect(canvasViewport).toHaveCSS("cursor", /grabbing-small\.svg.*grabbing/);
  await page.mouse.move(viewportBounds.x + 20, viewportBounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(viewportBounds.x + 110, viewportBounds.y + 240, { steps: 8 });
  await page.mouse.up();
  const afterPan = (await expandedMessage.boundingBox())!;
  expect(afterPan.x - beforePan.x).toBeCloseTo(90, 0);
  expect(afterPan.y - beforePan.y).toBeCloseTo(40, 0);
  await page.getByRole("button", { name: "Ajustar", exact: true }).click();
  const expandedPosition = await expandedMessage.boundingBox();
  expect(expandedPosition).not.toBeNull();
  await page.mouse.move(expandedPosition!.x + 80, expandedPosition!.y + 15);
  await page.mouse.down();
  await page.mouse.move(expandedPosition!.x + 145, expandedPosition!.y + 55, { steps: 8 });
  await page.mouse.up();
  const movedPosition = await expandedMessage.boundingBox();
  expect(movedPosition!.x).toBeGreaterThan(expandedPosition!.x + 30);
  expect(movedPosition!.y).toBeGreaterThan(expandedPosition!.y + 20);
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Mensagem inicial", exact: true })).toBeVisible();
  await selectChoice(page.getByRole("dialog").getByRole("combobox", { name: "Menu do fluxo" }), "scanner-menu");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Mensagem do submenu" })).toHaveValue("Qual problema você está enfrentando?");
  await selectChoice(page.getByRole("dialog").getByRole("combobox", { name: "Menu do fluxo" }), "root");
  await page.getByRole("button", { name: "Fechar visualização do fluxo" }).click();
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
  await page.getByRole('button', { name: 'Fechar teste', exact: true }).click();
  await page.getByRole("button", { name: "Minimapa", exact: true }).click();
  await expect(page.getByRole("button", { name: "Navegar pelo minimapa" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("bot-designer-desktop.png"), fullPage: true });
  const palette = page.getByRole("button", { name: "Transferir para humano Encaminha para atendimento", exact: true });
  await expect(palette).toBeVisible();
  const background = (await canvasViewport.boundingBox())!;
  await canvasViewport.click({ button: "right", position: { x: background.width - 20, y: background.height - 50 } });
  const contextBounds = (await contextMenu.boundingBox())!;
  expect(contextBounds.x + contextBounds.width).toBeLessThanOrEqual(background.x + background.width + 1);
  expect(contextBounds.y + contextBounds.height).toBeLessThanOrEqual(background.y + background.height + 1);
  await contextMenu.getByRole("menuitem", { name: "Transferir para humano", exact: true }).click();
  await expect(contextMenu).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Tipo de ação" })).toHaveAttribute("data-value", "HUMAN");
  await page.getByRole("textbox", { name: "Conteúdo da resposta" }).fill("Aguarde um técnico.");
  await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
  await expect(page.getByRole("status")).toContainText("Rascunho salvo");
  expect(saved[1].draft.menus[0].options).toHaveLength(4);
  const added = saved[1].draft.menus[0].options[3];
  expect(saved[1].draft.layout?.[`root:${added.id}`]).toBeDefined();
  await page.getByRole("button", { name: "Abrir submenu", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem do submenu" })).toHaveValue("Qual problema você está enfrentando?");
  await page.getByRole("button", { name: "Editar opção 1: Falar com suporte", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Tipo de ação" })).toHaveAttribute("data-value", "HUMAN");
});

for (const width of [390, 1440]) {
  test(`mensagem longa amplia ao centro e preserva o rascunho (${width}px)`, async ({ page }, testInfo) => {
    const draft: BotFlow = { rootMenuId: "root", backLabel: "Voltar", invalidMessage: "Escolha uma opção.", menus: [
      { id: "root", name: "Principal", text: "Olá!", options: [] },
    ] };
    let saved: BotFlow | undefined;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path.endsWith("/auth/get-session")) return route.fulfill({ json: { user: { id: "admin", name: "Admin", email: "admin@example.invalid" }, session: { id: "session", userId: "admin", expiresAt: "2099-01-01T00:00:00Z" } } });
      if (path.endsWith("/bots/long-text") && request.method() === "PUT") {
        saved = request.postDataJSON().draft;
        return route.fulfill({ json: { id: "long-text", name: "Bot", draft: saved, published: null, revision: 2 } });
      }
      if (path.endsWith("/bots")) return route.fulfill({ json: { bots: [{ id: "long-text", name: "Bot", draft, published: null, revision: 1 }], activeBotId: null, instanceAvailable: true } });
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/bots/");
    await page.getByRole("button", { name: "Editar Mensagem", exact: true }).click();
    const inline = page.getByRole("textbox", { name: "Mensagem inicial", exact: true });
    const text = "Olá! Esta é uma mensagem com várias linhas.\n".repeat(18);
    await inline.fill(text);
    const dialog = page.getByRole("dialog", { name: "Mensagem inicial", exact: true });
    await expect(dialog).toBeVisible();
    const enlarged = dialog.getByRole("textbox", { name: "Mensagem inicial", exact: true });
    await expect(enlarged).toBeFocused();
    await expect(enlarged).toHaveValue(text);
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(2);
    const edited = text + "Fim da mensagem.";
    await enlarged.fill(edited);
    await expect.poll(async () => {
      const field = (await enlarged.boundingBox())!;
      return Math.abs(field.x + field.width / 2 - width / 2) < 1 && Math.abs(field.y + field.height / 2 - 450) < 1;
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("mensagem-ampliada.png") });
    const returnAnimation = page.evaluate(() => new Promise<{ x: number; y: number; width: number; height: number }[]>(resolve => {
      const frames: { x: number; y: number; width: number; height: number }[] = [];
      const start = performance.now();
      function frame() {
        const field = document.querySelector('dialog[aria-label="Mensagem inicial"] textarea');
        if (!field || performance.now() - start > 2000) { resolve(frames); return; }
        const box = field.getBoundingClientRect();
        frames.push({ x: box.x, y: box.y, width: box.width, height: box.height });
        requestAnimationFrame(frame);
      }
      frame();
    }));
    await page.keyboard.press("Escape");
    const frames = await returnAnimation;
    expect(frames.length).toBeGreaterThan(3);
    expect(new Set(frames.map(frame => Math.round(frame.width))).size).toBeGreaterThan(3);
    await expect(dialog).toBeHidden();
    const destination = (await inline.boundingBox())!;
    const last = frames.at(-1)!;
    expect(Math.abs(last.x - destination.x)).toBeLessThan(3);
    expect(Math.abs(last.y - destination.y)).toBeLessThan(3);
    expect(Math.abs(last.width - destination.width)).toBeLessThan(3);
    expect(Math.abs(last.height - destination.height)).toBeLessThan(3);
    await expect(inline).toBeFocused();
    await expect(inline).toHaveValue(edited);
    await page.getByRole("button", { name: "Ampliar mensagem inicial" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button")).toHaveCount(0);
    await expect(dialog.getByRole("heading")).toHaveCount(0);
    expect(await dialog.evaluate(element => {
      const backdrop = getComputedStyle(element, "::backdrop");
      return { blur: backdrop.backdropFilter, background: backdrop.backgroundColor };
    })).toEqual({ blur: "none", background: "rgba(0, 0, 0, 0)" });
    await page.mouse.click(4, 4);
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
    await expect.poll(() => saved?.menus[0].text).toBe(edited);
    await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
    const fullScreen = page.getByRole("dialog", { name: "Visualização ampliada do fluxo", exact: true });
    await fullScreen.getByRole("button", { name: "Editar Mensagem", exact: true }).click();
    await fullScreen.getByRole("button", { name: "Ampliar mensagem inicial" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Mensagem inicial", exact: true })).toHaveValue(edited);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(fullScreen).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const height of [720, 1080]) {
  test(`editor ocupa a altura disponível sem faixa vazia (${height}px)`, async ({ page }, testInfo) => {
    const draft: BotFlow = { rootMenuId: "root", backLabel: "Voltar", invalidMessage: "Escolha uma opção.", menus: [
      { id: "root", name: "Principal", text: "Olá!", options: [] },
    ] };
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/get-session")) return route.fulfill({ json: { user: { id: "admin", name: "Admin", email: "admin@example.invalid" }, session: { id: "session", userId: "admin", expiresAt: "2099-01-01T00:00:00Z" } } });
      if (path.endsWith("/bots")) return route.fulfill({ json: { bots: [{ id: "layout", name: "Bot", draft, published: null, revision: 1 }], activeBotId: null, instanceAvailable: true } });
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width: 1920, height });
    await page.goto("/dashboard/bots/");
    for (const mode of ["menu", "overview"]) {
      await selectChoice(page.getByRole("combobox", { name: "Modo de visualização", exact: true }), mode);
      const canvas = page.getByRole("region", { name: mode === "menu" ? "Designer de fluxo" : "Visão geral do fluxo", exact: true });
      await expect(canvas).toBeVisible();
      await expect.poll(async () => {
        const box = (await canvas.boundingBox())!;
        return Math.abs(height - box.y - box.height - 12) < 2;
      }).toBe(true);
      const sidebar = page.locator("aside");
      const sidebarBox = (await sidebar.boundingBox())!;
      const canvasBox = (await canvas.boundingBox())!;
      expect(Math.abs(sidebarBox.y + sidebarBox.height - canvasBox.y - canvasBox.height)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
      await expect(sidebar).toHaveCSS("scrollbar-width", "none");
    }
    await page.getByRole("button", { name: "Editar menu Principal", exact: true }).click();
    await expect(page.getByRole("region", { name: "Editar nó", exact: true })).toBeVisible();
    const editorBox = (await page.getByRole("region", { name: "Editar nó", exact: true }).boundingBox())!;
    expect(Math.abs(height - editorBox.y - editorBox.height - 12)).toBeLessThan(2);
    const panel = page.locator("[data-bot-editor-panel]");
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeCloseTo(312, 0);
    await page.screenshot({ path: testInfo.outputPath("editor-altura-completa.png") });
    const closingFrames = page.evaluate(() => new Promise<{ width: number; opacity: number; canvas: number }[]>(resolve => {
      const frames: { width: number; opacity: number; canvas: number }[] = [];
      const started = performance.now();
      function sample() {
        const panel = document.querySelector("[data-bot-editor-panel]");
        const canvas = document.querySelector('[aria-label="Visão geral do fluxo"]');
        if (!panel || !canvas || performance.now() - started > 2000) { resolve(frames); return; }
        frames.push({ width: panel.getBoundingClientRect().width, opacity: Number(getComputedStyle(panel).opacity), canvas: canvas.getBoundingClientRect().width });
        requestAnimationFrame(sample);
      }
      sample();
    }));
    await page.getByRole("button", { name: "Fechar edição", exact: true }).click();
    const frames = await closingFrames;
    expect(new Set(frames.map(frame => Math.round(frame.width))).size).toBeGreaterThan(3);
    expect(new Set(frames.map(frame => frame.opacity)).size).toBeGreaterThan(3);
    await expect(panel).toHaveCount(0);
    expect(frames.at(-1)!.width).toBeLessThan(3);
    expect(frames.at(-1)!.canvas - frames[0].canvas).toBeGreaterThan(300);
    await page.getByRole("button", { name: "Editar nó", exact: true }).click();
    await expect(page.getByRole("region", { name: "Editar nó", exact: true })).toBeVisible();
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeCloseTo(312, 0);
    await expect(page.getByRole("textbox", { name: "Mensagem inicial", exact: true })).toHaveValue("Olá!");
  });
}

test("excluir, desfazer e refazer preserva posições, vínculos e edição de texto", async ({ page }) => {
  const original: BotFlow = { rootMenuId: "root", backLabel: "Voltar", invalidMessage: "Escolha uma opção.", layout: {
    "root:context": { x: 20, y: 20 }, "graph:root:context": { x: 20, y: 20 },
    "root:keyboard": { x: 280, y: 20 }, "graph:root:keyboard": { x: 280, y: 20 },
    "root:graph": { x: 540, y: 20 }, "graph:root:graph": { x: 540, y: 20 },
    "unused:menu": { x: 20, y: 20 }, "graph:unused:menu": { x: 20, y: 20 },
  }, menus: [
    { id: "root", name: "Principal", text: "Olá", options: [
      { id: "context", number: "1", label: "Contexto", response: "A", action: "MESSAGE", active: true, targetMenuId: "" },
      { id: "keyboard", number: "2", label: "Teclado", response: "B", action: "MESSAGE", active: true, targetMenuId: "" },
      { id: "graph", number: "3", label: "Visão geral", response: "C", action: "MESSAGE", active: true, targetMenuId: "" },
      { id: "link", number: "4", label: "Submenu", response: "", action: "SUBMENU", active: true, targetMenuId: "child" },
    ] },
    { id: "child", name: "Vinculado", text: "Atendimento", options: [] },
    { id: "unused", name: "Sem vínculo", text: "Menu independente", options: [] },
  ] };
  let current = { id: "delete", name: "Bot", draft: original, published: structuredClone(original), revision: 1 };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/get-session")) return route.fulfill({ json: { user: { id: "admin", name: "Admin", email: "admin@example.invalid" }, session: { id: "session", userId: "admin", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (path.endsWith("/bots/delete") && request.method() === "PUT") {
      current = { ...current, ...request.postDataJSON(), revision: current.revision + 1 };
      return route.fulfill({ json: current });
    }
    if (path.endsWith("/bots")) return route.fulfill({ json: { bots: [current], activeBotId: null, instanceAvailable: true } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1720, height: 1050 });
  await page.goto("/dashboard/bots/");
  const canvas = page.getByRole("region", { name: "Designer de fluxo", exact: true });
  await canvas.getByRole("button", { name: "Ajustar", exact: true }).click();
  const keyboard = canvas.locator('[data-flow-node="root:keyboard"]');
  await keyboard.click();
  const context = canvas.locator('[data-flow-node="root:context"]');
  await context.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
  await expect(context).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(context).toBeVisible();
  await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
  await expect.poll(() => current.draft.menus[0].options.map(option => option.id)).toEqual(["context", "keyboard", "graph", "link"]);
  expect(current.draft.layout?.["root:context"]).toEqual(original.layout?.["root:context"]);
  expect(current.draft.layout?.["graph:root:context"]).toEqual(original.layout?.["graph:root:context"]);
  await page.locator("[data-flow-viewport]").focus();
  await page.keyboard.press("Control+Shift+z");
  await expect(context).toHaveCount(0);
  await expect(keyboard).toBeVisible();
  await keyboard.click();
  const label = page.getByRole("textbox", { name: "Nome da opção", exact: true });
  await label.press("Home");
  await label.press("Delete");
  await expect(label).toHaveValue("eclado");
  await label.press("Control+z");
  await expect(label).toHaveValue("Teclado");
  await expect(context).toHaveCount(0);
  await expect(keyboard).toBeVisible();
  await keyboard.press("Delete");
  await expect(keyboard).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(keyboard).toBeVisible();
  await expect(keyboard).toBeFocused();
  await page.keyboard.press("Control+Shift+z");
  await expect(keyboard).toHaveCount(0);
  await selectChoice(page.getByRole("combobox", { name: "Modo de visualização", exact: true }), "overview");
  const overview = page.getByRole("region", { name: "Visão geral do fluxo", exact: true });
  const graphOption = overview.locator('[data-graph-node="graph:root:graph"]');
  await graphOption.click();
  await graphOption.press("Delete");
  await expect(graphOption).toHaveCount(0);
  const root = overview.getByRole("button", { name: "Editar menu Principal", exact: true });
  await root.click();
  await root.press("Delete");
  await expect(root).toBeVisible();
  const linked = overview.getByRole("button", { name: "Editar menu Vinculado", exact: true });
  await linked.click();
  await linked.press("Delete");
  await expect(linked).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Remova as opções que apontam" })).toBeVisible();
  const unused = overview.getByRole("button", { name: "Editar menu Sem vínculo", exact: true });
  await unused.click();
  await unused.press("Delete");
  await expect(unused).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(unused).toBeVisible();
  await page.keyboard.press("Control+y");
  await expect(unused).toHaveCount(0);
  await page.getByRole("button", { name: /^Salvar rascunho/ }).click();
  await expect.poll(() => current.draft.menus[0].options.map(option => option.id)).toEqual(["link"]);
  expect(current.draft.menus.map(menu => menu.id)).toEqual(["root", "child"]);
  for (const key of ["root:context", "graph:root:context", "root:keyboard", "graph:root:keyboard", "root:graph", "graph:root:graph", "unused:menu", "graph:unused:menu"]) expect(current.draft.layout).not.toHaveProperty(key);
  expect(current.published).toEqual(original);
});
