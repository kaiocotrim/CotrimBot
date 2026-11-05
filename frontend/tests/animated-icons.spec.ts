import { expect, test, type Locator, type Page } from "@playwright/test";

async function mockChat(page: Page) {
  const runtimeErrors: string[] = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/auth/get-session")) body = {
      user: { id: "icon-user", name: "Teste de ícones", email: "icons@example.invalid", emailVerified: true },
      session: { id: "icon-session", userId: "icon-user", expiresAt: "2099-01-01T00:00:00Z" },
    };
    else if (path.endsWith("/contacts")) body = [{
      id: 1, name: "Conversa de ícones", phone: "5527999999999", isGroup: false,
      isSaved: true, archived: false, assignedUserIds: ["icon-user"], unreadCount: 0,
      messages: [{ id: 1, externalId: "icon-message", contactId: 1, content: "Olá!", type: "TEXT", direction: "INCOMING", createdAt: "2026-11-05T12:00:00Z", readAt: "2026-11-05T12:01:00Z" }],
    }];
    else if (path.endsWith("/messages")) body = { messages: [], hasMore: false, nextCursor: null };
    else if (path.endsWith("/notifications")) body = { notifications: [], unreadCount: 0 };
    else if (path.endsWith("/avatar")) body = { profilePictureUrl: null };
    else if (path.endsWith("/media-library")) body = { count: 0, items: [], hasMore: false, nextCursor: null };
    await route.fulfill({ json: body, headers: {
      "access-control-allow-origin": request.headers().origin ?? "*",
      "access-control-allow-credentials": "true",
    } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Conversa de ícones", exact: true }).click();
  return runtimeErrors;
}

function iconTransform(icon: Locator) {
  return icon.evaluate(svg => getComputedStyle(svg).transform);
}

test("ícones animam pelo controle completo e pelo teclado sem alterar as ações", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await mockChat(page);
  const composer = page.locator("[data-message-composer]");
  const attachments = composer.getByRole("button", { name: "Abrir anexos", exact: true });
  const plus = attachments.locator('svg[data-animated-icon="plus"]');
  await expect(plus).toHaveAttribute("viewBox", "0 0 24 24");
  await expect(plus).toHaveAttribute("stroke-width", "1.8");
  await attachments.focus();
  await expect.poll(() => iconTransform(plus)).not.toBe("none");
  await attachments.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Documento", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // This glyph has no registry animation; its SVG still responds to the whole button.
  const smileButton = composer.getByRole("button", { name: "Abrir emojis", exact: true });
  const smile = smileButton.locator('svg[data-animated-icon="sticker"]');
  await smileButton.hover();
  await expect.poll(() => iconTransform(smile)).not.toBe("none");
  await smileButton.focus();
  await page.mouse.move(0, 0);
  await smileButton.press("Enter");
  await expect(smileButton).toHaveAttribute("aria-expanded", "true");
  expect(errors).toEqual([]);
});

test("movimento reduzido e controles desabilitados permanecem estáticos", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await mockChat(page);
  const composer = page.locator("[data-message-composer]");
  const smileButton = composer.getByRole("button", { name: "Abrir emojis", exact: true });
  const smile = smileButton.locator('svg[data-animated-icon="sticker"]');
  await smileButton.focus();
  await smileButton.hover();
  await expect(smile).toHaveCSS("transform", "none");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const send = composer.getByRole("button", { name: "Enviar mensagem", exact: true });
  await expect(send).toBeDisabled();
  const icon = send.locator('svg[data-animated-icon="send"]');
  const before = await icon.evaluate(svg => svg.outerHTML);
  await send.dispatchEvent("pointerenter");
  await send.dispatchEvent("pointerdown");
  const frames = await icon.evaluate(async svg => {
    const samples: string[] = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      samples.push(svg.outerHTML);
    }
    return samples;
  });
  expect(frames.every(frame => frame === before)).toBe(true);
  expect(errors).toEqual([]);
});
