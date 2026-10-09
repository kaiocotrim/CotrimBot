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
  test(`menu de conversas vira painel sobreposto (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { runtimeErrors } = await mockApi(page);
    await page.goto("/");

    const sidebar = page.locator("#chat-sidebar");
    const contactButton = page.getByRole("button", { name: "Contato de teste", exact: true });
    const menuButton = page.getByRole("button", { name: "Abrir menu de conversas" });
    await expect(page.getByText("Selecione um contato para iniciar")).toBeVisible();
    await expect(sidebar).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expectNoHorizontalOverflow(page);

    // Abre pelo botão de menu e fecha ao escolher a conversa.
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toHaveAttribute("data-sidebar-open", "true");
    await expect(sidebar).toBeFocused();
    await expect(contactButton).toBeVisible();
    await expect.poll(async () => (await sidebar.boundingBox())!.x).toBe(0);
    expect((await sidebar.boundingBox())!.width).toBeLessThan(viewport.width);
    await contactButton.click();
    await expect(sidebar).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();

    // Mensagens com textos longos quebram sem gerar rolagem horizontal.
    const bubble = page.locator('[data-message-id="1"]').getByText(longWord, { exact: false });
    await expect(bubble).toBeVisible();
    const bubbleBox = await bubble.boundingBox();
    expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(viewport.width);
    await expectNoHorizontalOverflow(page);

    // Reabre pelo cabeçalho do chat e fecha clicando fora (no fundo escurecido).
    await menuButton.click();
    await expect(contactButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "Nova conversa" }).click();
    await page.getByRole("button", { name: "Novo contato" }).click();
    await page.getByRole("button", { name: /^País, Brasil/ }).click();
    await expect(page.locator("[data-country-code-popup]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-country-code-popup]")).toBeHidden();
    await expect(sidebar).toHaveAttribute("data-sidebar-open", "true");
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();

    await menuButton.click();
    await page.getByRole("button", { name: "Voltar às conversas" }).click();
    await expect(contactButton).toBeVisible();
    await page.mouse.click(viewport.width - 8, viewport.height / 2);
    await expect(sidebar).toBeHidden();

    // Também fecha pelo botão de fechar dentro do painel.
    await menuButton.click();
    await page.getByRole("button", { name: "Fechar menu de conversas" }).first().click();
    await expect(sidebar).toBeHidden();
    expect(runtimeErrors).toEqual([]);
  });
}

test("menu de conversas pode ser recolhido no desktop (1280px)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { runtimeErrors } = await mockApi(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Abrir menu de conversas" })).toBeHidden();
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
