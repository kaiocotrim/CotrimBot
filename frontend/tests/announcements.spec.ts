import { expect, test, type Page } from "@playwright/test";

async function selectCompany(page: Page) {
  await page.getByRole("combobox", { name: "Empresa destinatária" }).click();
  await page.getByRole("option", { name: "Empresa teste", exact: true }).click();
}

async function setup(page: Page) {
  const sends: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const state = { stale: false };
  let history: unknown[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = {};
    if (path.endsWith("/auth/get-session")) body = {
      user: { id: "kaio", name: "Kaio teste", email: "kaio@example.invalid", role: "user", emailVerified: true },
      session: { id: "test", userId: "kaio", token: "test", expiresAt: "2099-01-01T00:00:00Z" },
    };
    else if (path.endsWith("/clients")) body = { clients: [{ id: "empresa", name: "Empresa teste", links: [] }, { id: "cazan", name: "Cazán", links: [] }] };
    else if (path.endsWith("/announcements/preview")) body = {
      companyName: "Empresa teste", previewToken: "preview-token", excluded: 1,
      recipients: [{ id: 1, name: "Ana teste", phone: "5527999990001" }, { id: 2, name: "Pedro teste", phone: "5527999990002" }],
    };
    else if (path.endsWith("/announcements") && request.method() === "POST") {
      sends.push(request.postDataJSON());
      if (state.stale) { await route.fulfill({ status: 409, json: { error: "Os destinatários mudaram. Revise novamente antes de enviar." } }); return; }
      history = [{ id: "new", companyName: "Empresa teste", content: "Novidade da empresa!", createdAt: "2026-10-23T15:00:00Z", messages: [
        { id: "one", recipientName: "Ana teste", phone: "5527999990001", status: "SENT", error: null },
        { id: "two", recipientName: "Pedro teste", phone: "5527999990002", status: "FAILED", error: "Conexão indisponível" },
      ] }];
      body = { announcement: { id: "new" } };
    }
    else if (path.endsWith("/announcements")) body = { announcements: history };
    else if (path.endsWith("/contacts") || path.endsWith("/organization/list") || path.endsWith("/contacts/assignees")) body = [];
    else if (path.endsWith("/notifications")) body = { notifications: [], unreadCount: 0 };
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir configurações de Kaio teste" }).click();
  await page.getByRole("tab", { name: "Notícias", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Empresa destinatária" })).toBeEnabled();
  return { sends, errors, state };
}

for (const width of [1280, 390]) {
  test(`revisão permite excluir e reincluir destinatários antes de enviar (${width}px)`, async ({ page }) => {
    const { sends, errors } = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await selectCompany(page);
    await page.getByRole("textbox", { name: "Mensagem do comunicado" }).fill("Comunicado para contatos selecionados");
    await page.getByRole("button", { name: "Revisar destinatários" }).click();
    const ana = page.getByRole("checkbox", { name: "Incluir Ana teste no comunicado" });
    const pedro = page.getByRole("checkbox", { name: "Incluir Pedro teste no comunicado" });
    await expect(ana).toBeChecked();
    await expect(pedro).toBeChecked();
    await ana.uncheck();
    await expect(page.getByRole("button", { name: "Enviar para 1 contato(s)" })).toBeEnabled();
    await pedro.uncheck();
    await expect(page.getByRole("button", { name: "Enviar para 0 contato(s)" })).toBeDisabled();
    await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
    await expect(ana).toBeChecked();
    await expect(pedro).toBeChecked();
    await ana.uncheck();
    await page.getByRole("button", { name: "Enviar para 1 contato(s)" }).click();
    await expect(page.getByRole("status")).toContainText("Comunicado colocado na fila para 1 contato(s)");
    expect(sends).toHaveLength(1);
    expect(sends[0]!.recipientIds).toEqual([2]);
    expect(errors).toEqual([]);
  });
}

for (const width of [1280, 390]) {
  test(`comunicado exige revisão e confirmação e exibe histórico (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { sends, errors } = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await selectCompany(page);
    await page.getByRole("textbox", { name: "Mensagem do comunicado" }).fill("Novidade da empresa!");
    await page.screenshot({ path: testInfo.outputPath("noticias-composicao.png") });
    await page.getByRole("button", { name: "Revisar destinatários" }).click();
    await expect(page.getByRole("heading", { name: "Revise antes de enviar" })).toBeFocused();
    await expect(page.getByLabel("Destinatários do comunicado")).toContainText("Ana teste");
    expect(sends).toHaveLength(0);
    await page.getByRole("button", { name: "Enviar para 2 contato(s)" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("noticias-revisao.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Enviar para 2 contato(s)" }).click();
    await expect(page.getByRole("status")).toContainText("Comunicado colocado na fila para 2 contato(s)");
    await expect(page.getByText("1 enviado(s)", { exact: true })).toBeVisible();
    await page.getByText("Ver destinatários e status").click();
    await expect(page.getByText("Conexão indisponível", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ver destinatários e status" }).click();
    await expect(page.getByRole("region", { name: "Envios para Empresa teste" })).toBeHidden();
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({ clientId: "empresa", content: "Novidade da empresa!", previewToken: "preview-token" });
    expect(sends[0]!.requestKey).toBeTruthy();
    expect(errors).toEqual([]);
  });
}

test("falha mantém texto e a mesma confirmação para tentativa HTTP segura", async ({ page }) => {
  const { sends, state, errors } = await setup(page);
  await selectCompany(page);
  await page.getByRole("textbox", { name: "Mensagem do comunicado" }).fill("Novidade da empresa!");
  await page.getByRole("button", { name: "Revisar destinatários" }).click();
  state.stale = true;
  await page.getByRole("button", { name: "Enviar para 2 contato(s)" }).click();
  await expect(page.getByRole("alert")).toContainText("Os destinatários mudaram");
  await page.getByRole("button", { name: "Enviar para 2 contato(s)" }).click();
  await expect.poll(() => sends.length).toBe(2);
  expect(sends[0]!.requestKey).toBe(sends[1]!.requestKey);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem do comunicado" })).toHaveValue("Novidade da empresa!");
  expect(errors).toEqual([]);
});

test("revisão sem destinatários preserva o rascunho com movimento reduzido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { sends, errors } = await setup(page);
  await page.route("**/api/announcements/preview", (route) => route.fulfill({ json: {
    companyName: "Empresa teste", previewToken: "empty-preview", excluded: 2, recipients: [],
  } }));
  await expect(page.getByText("Tudo começa com uma novidade.")).toBeVisible();
  await selectCompany(page);
  await page.getByRole("textbox", { name: "Mensagem do comunicado" }).fill("Uma novidade para todos.");
  await page.getByRole("button", { name: "Revisar destinatários" }).click();
  await expect(page.getByRole("heading", { name: "Revise antes de enviar" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Enviar para 0 contato(s)" })).toBeDisabled();
  await expect(page.getByText("Nenhum contato disponível.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem do comunicado" })).toHaveValue("Uma novidade para todos.");
  await expect(page.getByRole("combobox", { name: "Empresa destinatária" })).toContainText("Empresa teste");
  expect(sends).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("seletor de empresa exibe seleção e permite fechar pelo teclado", async ({ page }, testInfo) => {
  const { errors } = await setup(page);
  const company = page.getByRole("combobox", { name: "Empresa destinatária" });
  await company.click();
  await page.getByRole("option", { name: "Empresa teste", exact: true }).click();
  await expect(company).toContainText("Empresa teste");
  await company.click();
  await expect(page.getByRole("option", { name: "Empresa teste", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: testInfo.outputPath("noticias-empresas.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(company).toBeFocused();
  expect(errors).toEqual([]);
});


test("busca filtra empresas, trata lista vazia e seleciona pelo teclado", async ({ page }) => {
  const { sends, errors } = await setup(page);
  const company = page.getByRole("combobox", { name: "Empresa destinatária" });
  await company.click();
  const search = page.getByRole("combobox", { name: "Buscar empresa" });
  await expect(search).toBeFocused();
  await search.fill("não existe");
  await expect(page.getByText("Nenhuma empresa encontrada.")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.fill("cazan");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Cazán", exact: true })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(company).toContainText("Cazán");
  await company.click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("option")).toHaveCount(2);
  await search.press("Escape");
  await expect(company).toBeFocused();
  expect(sends).toHaveLength(0);
  expect(errors).toEqual([]);
});
