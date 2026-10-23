import { expect, test, type Page } from "@playwright/test";

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
    else if (path.endsWith("/clients")) body = { clients: [{ id: "empresa", name: "Empresa teste", links: [] }] };
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
  test(`comunicado exige revisão e confirmação e exibe histórico (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { sends, errors } = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("combobox", { name: "Empresa destinatária" }).selectOption("empresa");
    await page.getByRole("textbox", { name: "Mensagem do comunicado" }).fill("Novidade da empresa!");
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
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({ clientId: "empresa", content: "Novidade da empresa!", previewToken: "preview-token" });
    expect(sends[0]!.requestKey).toBeTruthy();
    expect(errors).toEqual([]);
  });
}

test("falha mantém texto e a mesma confirmação para tentativa HTTP segura", async ({ page }) => {
  const { sends, state, errors } = await setup(page);
  await page.getByRole("combobox", { name: "Empresa destinatária" }).selectOption("empresa");
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
