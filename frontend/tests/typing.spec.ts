import { expect, test, type Page } from "@playwright/test";

async function openTestConversation(page: Page) {
  const runtimeErrors: string[] = [];
  const sent: { text: string; private: boolean }[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const contact = { id: 1, name: "Contato de teste", phone: "5500000000000", isGroup: false, archived: false, unreadCount: 0, profilePictureUrl: null, messages: [] };

  // O frontend e o hook reais são exercitados; toda API é simulada no navegador.
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
      body = { messages: [], hasMore: false, nextCursor: null };
    } else if (pathname.endsWith("/send")) {
      const data = route.request().postDataJSON();
      sent.push(data);
      body = { message: { id: 100 + sent.length, externalId: `test-${sent.length}`, clientId: data.clientId, content: data.text, private: data.private, contactId: 1, direction: "OUTGOING", type: "TEXT", createdAt: new Date().toISOString(), readAt: null, reaction: null, senderName: null, senderPhone: null, senderProfilePictureUrl: null } };
    } else if (!pathname.endsWith("/messages/read") && !pathname.endsWith("/presence-subscription")) {
      throw new Error(`API de teste não simulada: ${pathname}`);
    }
    await route.fulfill({ json: body });
  });

  await page.goto("/");
  await page.getByText("Contato de teste", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
  return { runtimeErrors, sent };
}

for (const width of [1280, 768]) {
  test(`pontos acompanham o texto e animam (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    const { runtimeErrors, sent } = await openTestConversation(page);
    const input = page.getByRole("textbox", { name: "Mensagem", exact: true });
    const indicator = page.getByRole("status", { name: "Você está digitando", exact: true });

    await input.click();
    await expect(indicator).toHaveCount(0);
    await input.fill("   ");
    await expect(indicator).toHaveCount(0);
    await input.fill("");
    await input.pressSequentially("Olá", { delay: 120 });
    await expect(indicator).toBeVisible();
    const dots = indicator.locator('span[aria-hidden="true"]');
    await expect(dots).toHaveCount(3);

    const frames = await dots.evaluateAll(async (elements) => {
      const frames: { transform: string; opacity: string; width: number; height: number; x: number; y: number }[][] = [];
      const start = performance.now();
      while (performance.now() - start < 1000) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        frames.push(elements.map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return { transform: style.transform, opacity: style.opacity, width: rect.width, height: rect.height, x: rect.x, y: rect.y };
        }));
      }
      return frames;
    });
    for (let index = 0; index < 3; index++) {
      expect(new Set(frames.map((frame) => frame[index].transform)).size).toBeGreaterThan(2);
      expect(frames[0][index].width).toBeGreaterThanOrEqual(4);
      expect(frames[0][index].height).toBeGreaterThanOrEqual(4);
      expect(frames[0][index].y).toBeGreaterThanOrEqual(0);
      expect(frames[0][index].y + frames[0][index].height).toBeLessThan(800);
    }
    expect(frames.some((frame) => new Set(frame.map((dot) => dot.transform)).size > 1)).toBe(true);
    await testInfo.attach("animation-frames", { body: JSON.stringify(frames), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath("typing.png") });

    await page.getByRole("button", { name: "Localizar mensagens", exact: true }).focus();
    await expect(indicator).toBeVisible();
    await input.fill("");
    await expect(indicator).toHaveCount(0);
    await input.fill("Primeira linha\nSegunda linha");
    await expect(indicator).toBeVisible();
    await page.keyboard.press("Control+m");
    await expect(input).toHaveAttribute("placeholder", "Digite uma mensagem privada...");
    await expect(indicator).toBeVisible();
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(indicator).toHaveCount(0);
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ text: "Primeira linha\nSegunda linha", private: true });
    await expect(page.getByRole("button", { name: "Abrir anexos", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gravar áudio", exact: true })).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });
}
