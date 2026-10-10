import { expect, test, type Page } from "@playwright/test";

const longWord = "a".repeat(160);

async function mockApi(page: Page) {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const message = { id: 1, externalId: "test-1", content: `Mensagem longa ${longWord}`, private: false, contactId: 1, direction: "INCOMING", type: "TEXT", createdAt: new Date().toISOString(), readAt: null, reaction: null, senderName: null, senderPhone: null, senderProfilePictureUrl: null };
  const contact = { id: 1, name: "Contato de teste", phone: "5500000000000", isGroup: false, archived: false, unreadCount: 0, profilePictureUrl: null, messages: [message] };

  // Toda API é simulada no navegador, como no teste de digitação.
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (pathname.endsWith("/auth/get-session")) {
      body = {
        user: { id: "test-user", name: "Teste local", email: "test@example.invalid", emailVerified: true, role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        session: { id: "test-session", userId: "test-user", token: "test-only", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      };
    } else if (pathname.endsWith("/contacts/assignees")) {
      body = [];
    } else if (pathname.endsWith("/contacts")) {
      body = [contact];
    } else if (pathname.endsWith("/avatar")) {
      body = { profilePictureUrl: null };
    } else if (pathname.endsWith("/messages")) {
      body = { messages: [message], hasMore: false, nextCursor: null };
    } else if (pathname.endsWith("/notifications")) {
      body = { notifications: [], unreadCount: 0 };
    }
    await route.fulfill({ json: body });
  });
  return { runtimeErrors };
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of [{ width: 320, height: 640 }, { width: 414, height: 800 }, { width: 768, height: 1024 }]) {
  test(`lista de conversas vira a tela principal (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { runtimeErrors } = await mockApi(page);
    await page.goto("/");

    const sidebar = page.locator("#chat-sidebar");
    const contactButton = page.getByRole("button", { name: "Contato de teste", exact: true });
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-sidebar-open", "true");
    await expect(page.getByRole("heading", { name: "Conversas" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toHaveCount(0);
    await expect(contactButton).toBeVisible();
    const listBox = await sidebar.boundingBox();
    expect(listBox!.x).toBe(0);
    expect(listBox!.width).toBe(viewport.width);
    await expectNoHorizontalOverflow(page);

    // Escolher uma conversa troca a lista pelo chat em tela cheia.
    await contactButton.click();
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
    const backButton = page.getByRole("button", { name: "Voltar para conversas" });
    await expect(backButton).toBeVisible();
    await expect(backButton).toHaveAttribute("aria-expanded", "false");

    // Mensagens com textos longos quebram sem gerar rolagem horizontal.
    const bubble = page.locator('[data-message-id="1"]').getByText(longWord, { exact: false });
    await expect(bubble).toBeVisible();
    const bubbleBox = await bubble.boundingBox();
    expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(viewport.width);
    await expectNoHorizontalOverflow(page);

    // As informações do contato substituem visualmente o chat no mobile,
    // sem entrar no fluxo abaixo da conversa nem aumentar a página.
    await page.getByRole("button", { name: "Informações do contato", exact: true }).click();
    const contactInfo = page.getByRole("complementary", { name: "Informações do contato" });
    await expect(contactInfo).toBeVisible();
    await expect.poll(async () => (await contactInfo.boundingBox())!.x).toBe(0);
    const infoBox = await contactInfo.boundingBox();
    expect(infoBox!.x).toBe(0);
    expect(infoBox!.y).toBe(0);
    expect(infoBox!.width).toBe(viewport.width);
    expect(infoBox!.height).toBe(viewport.height);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Fechar informações" }).click();
    await expect(contactInfo).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();

    // O botão de voltar restaura a lista como tela principal.
    await backButton.click();
    await expect(contactButton).toBeVisible();
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())!.width).toBe(viewport.width);

    expect(runtimeErrors).toEqual([]);
  });
}

test("menu de conversas pode ser recolhido no desktop (1280px)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { runtimeErrors } = await mockApi(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Voltar para conversas" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "CotrimBot" })).toBeVisible();
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
  await expect(page.locator("#chat-sidebar")).toBeVisible();

  const sidebar = page.getByRole("complementary", { name: "Barra lateral de conversas" });
  const expandedWidth = (await sidebar.boundingBox())!.width;
  const collapseButton = page.getByRole("button", { name: "Recolher menu de conversas" });
  await collapseButton.click();
  await expect(page.getByRole("heading", { name: "CotrimBot" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Expandir menu de conversas" })).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toHaveCount(0);
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(expandedWidth);

  const expandButton = page.getByRole("button", { name: "Expandir menu de conversas" });
  await expandButton.click();
  await expect(page.getByRole("heading", { name: "CotrimBot" })).toBeVisible();
  await expect(collapseButton).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("deslizar para a esquerda retorna à lista e preserva o rascunho", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page);
  await page.goto("/");
  const contactButton = page.getByRole("button", { name: "Contato de teste", exact: true });
  await contactButton.click();
  const composer = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await composer.fill("rascunho preservado");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const panel = page.locator("[data-swipe-back-panel]");
  const sidebar = page.locator("#chat-sidebar");
  expect(await page.evaluate(() => Boolean(document.elementFromPoint(220, 180)?.closest("[data-swipe-back-area]")))).toBe(true);

  // Um movimento vertical e um horizontal curto não fecham a conversa.
  await touch("touchStart", 220, 180);
  await touch("touchMove", 215, 255);
  await touch("touchEnd", 215, 255);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "false");
  await touch("touchStart", 220, 180);
  await touch("touchMove", 175, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(-20);
  await touch("touchEnd", 175, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThan(-1);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "false");
  await touch("touchStart", 280, 180);
  await touch("touchMove", 130, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(-100);
  await touch("touchEnd", 130, 180);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "true");
  await expect(contactButton).toHaveAttribute("aria-current", "true");
  await contactButton.click();
  await expect(composer).toHaveValue("rascunho preservado");

  // Deslizar da esquerda para a direita não fecha a conversa.
  await touch("touchStart", 24, 180);
  await page.waitForTimeout(600);
  await touch("touchMove", 204, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBe(0);
  await touch("touchEnd", 204, 180);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "false");
  expect(runtimeErrors).toEqual([]);
});
