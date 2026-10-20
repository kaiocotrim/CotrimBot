import { expect, test, type Page } from "@playwright/test";

const longWord = "a".repeat(160);

async function mockApi(page: Page, messageCount = 1, compactExamples = false, contactCount = 1) {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const message = { id: 1, externalId: "test-1", content: `Mensagem longa ${longWord}`, private: false, contactId: 1, direction: "INCOMING", type: "TEXT", createdAt: new Date().toISOString(), readAt: null, reaction: null, senderName: null, senderPhone: null, senderProfilePictureUrl: null };
  const messages = Array.from({ length: messageCount }, (_, index) => ({ ...message, id: index + 1, externalId: `test-${index + 1}`, private: compactExamples && index === 1, content: compactExamples && index < 2 ? index === 0 ? "OSS" : "Nota privada" : `Mensagem ${index + 1}: ${message.content}` }));
  const contact = { id: 1, name: "Contato de teste", phone: "5511999999999", isGroup: false, archived: false, unreadCount: 0, profilePictureUrl: null, messages: [message] };

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
      body = Array.from({ length: contactCount }, (_, index) => ({ ...contact, id: index + 1, name: index ? `Contato ${index + 1}` : contact.name }));
    } else if (pathname.endsWith("/avatar")) {
      body = { profilePictureUrl: null };
    } else if (pathname.endsWith("/messages")) {
      body = { messages, hasMore: false, nextCursor: null };
    } else if (pathname.endsWith("/notifications")) {
      body = { notifications: [], unreadCount: 0 };
    } else if (pathname.endsWith("/media-library")) {
      body = { count: 0, items: [] };
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
    await expect(sidebar).toHaveAttribute("inert", "");
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
    const backButton = page.getByRole("button", { name: "Voltar para conversas" });
    await expect(backButton).toBeVisible();
    await expect(backButton).toHaveAttribute("aria-expanded", "false");

    // As ações do cabeçalho ficam separadas; o emoji pertence ao campo,
    // enquanto anexos, câmera e microfone ficam fora da cápsula de texto.
    const call = page.getByRole("link", { name: "Ligar para Contato de teste" });
    const menu = page.getByRole("button", { name: "Mais opções", exact: true });
    const info = page.getByRole("button", { name: "Informações do contato", exact: true });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", "tel:+5511999999999");
    await expect(menu).toBeVisible();
    await expect(info).toBeVisible();
    const [callBox, menuBox, infoBox] = await Promise.all([call.boundingBox(), menu.boundingBox(), info.boundingBox()]);
    expect(callBox!.x + callBox!.width).toBeLessThanOrEqual(menuBox!.x + 1);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(infoBox!.x + 1);

    const composer = page.locator("[data-message-composer]");
    await expect(composer).toHaveAttribute("data-mobile", "true");
    const input = composer.getByRole("textbox", { name: "Mensagem", exact: true });
    const field = composer.locator("[data-composer-field]");
    const attachments = composer.getByRole("button", { name: "Abrir anexos", exact: true });
    const emojis = composer.getByRole("button", { name: "Abrir emojis", exact: true });
    const camera = composer.getByRole("button", { name: "Abrir câmera", exact: true });
    const microphone = composer.getByRole("button", { name: "Gravar áudio", exact: true });
    await expect(input).toHaveCount(1);
    for (const control of [field, attachments, emojis, camera, microphone]) await expect(control).toBeVisible();
    await expect(composer.getByRole("button", { name: "Enviar mensagem", exact: true })).toBeHidden();
    const [fieldBox, inputBox, attachmentsBox, emojiBox, cameraBox, microphoneBox] = await Promise.all(
      [field, input, attachments, emojis, camera, microphone].map((control) => control.boundingBox()),
    );
    expect(attachmentsBox!.x + attachmentsBox!.width).toBeLessThanOrEqual(fieldBox!.x + 1);
    expect(fieldBox!.x + fieldBox!.width).toBeLessThanOrEqual(cameraBox!.x + 1);
    expect(cameraBox!.x + cameraBox!.width).toBeLessThanOrEqual(microphoneBox!.x + 1);
    expect(inputBox!.x).toBeGreaterThanOrEqual(fieldBox!.x);
    expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(emojiBox!.x + 1);
    expect(emojiBox!.x + emojiBox!.width).toBeLessThanOrEqual(fieldBox!.x + fieldBox!.width);

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
    const contactInfoBox = await contactInfo.boundingBox();
    expect(contactInfoBox!.x).toBe(0);
    expect(contactInfoBox!.y).toBe(0);
    expect(contactInfoBox!.width).toBe(viewport.width);
    expect(contactInfoBox!.height).toBe(viewport.height);
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

test("composer mobile abre câmera e emojis e troca microfone por envio", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page);
  const sentTexts: string[] = [];
  await page.route("**/contacts/1/send", async (route) => {
    const payload = route.request().postDataJSON() as { text: string; clientId: string; private: boolean };
    sentTexts.push(payload.text);
    await route.fulfill({ json: { message: {
      id: 2, externalId: "sent-2", contactId: 1, content: payload.text,
      clientId: payload.clientId, private: payload.private, direction: "OUTGOING", type: "TEXT",
      createdAt: new Date().toISOString(), readAt: null, reaction: null,
      senderName: null, senderPhone: null, senderProfilePictureUrl: null,
    } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();

  const composer = page.locator("[data-message-composer]");
  const input = composer.getByRole("textbox", { name: "Mensagem", exact: true });
  const microphone = composer.getByRole("button", { name: "Gravar áudio", exact: true });
  const send = composer.getByRole("button", { name: "Enviar mensagem", exact: true });
  await expect(microphone).toBeVisible();
  const chooserPromise = page.waitForEvent("filechooser");
  await composer.getByRole("button", { name: "Abrir câmera", exact: true }).click();
  const chooser = await chooserPromise;
  expect(await chooser.element().getAttribute("accept")).toBe("image/*");
  expect(await chooser.element().getAttribute("capture")).toBe("environment");
  await chooser.setFiles({
    name: "camera.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=", "base64"),
  });
  await expect(composer.getByRole("img", { name: "Prévia de camera.png", exact: true })).toBeVisible();
  await expect(send).toBeVisible();
  await expect(microphone).toBeHidden();
  await composer.getByRole("button", { name: "Remover camera.png", exact: true }).click();
  await expect(microphone).toBeVisible();
  await expect(send).toBeHidden();

  await input.fill("Olá 😊");
  await composer.getByRole("button", { name: "Abrir emojis", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Selecionar emoji", exact: true })).toBeVisible();
  const picker = page.locator(".EmojiPickerReact");
  await expect(picker).toBeVisible();
  const pickerElement = await picker.elementHandle();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(picker).toHaveCount(1);
  await composer.getByRole("button", { name: "Abrir emojis", exact: true }).click();
  await expect(picker).toBeVisible();
  expect(await pickerElement!.evaluate((element) => element === document.querySelector(".EmojiPickerReact"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("Olá 😊");
  await expect(send).toBeVisible();
  await expect(microphone).toBeHidden();
  await send.click();
  await expect.poll(() => sentTexts).toEqual(["Olá 😊"]);
  await expect(input).toHaveValue("");
  await expect(page.locator('[data-message-id="2"]')).toContainText("Olá");
  await expect(microphone).toBeVisible();
  await expect(send).toBeHidden();
  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("bolhas mobile compactas preservam texto longo e mensagem privada", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page, 3, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  const short = page.locator('[data-message-id="1"] [data-message-bubble]');
  const privateBubble = page.locator('[data-message-id="2"] [data-message-bubble]');
  const long = page.locator('[data-message-id="3"] [data-message-bubble]');
  await expect(short).toContainText("OSS");
  await expect(privateBubble).toContainText("Privado");
  await expect(privateBubble).toHaveAttribute("data-private", "true");
  expect((await short.boundingBox())!.width).toBeLessThan(140);
  expect((await short.boundingBox())!.height).toBeLessThan(40);
  expect((await privateBubble.boundingBox())!.height).toBeLessThan(60);
  expect((await long.boundingBox())!.width).toBeLessThanOrEqual(390 * 0.85);
  expect(await short.evaluate((element) => getComputedStyle(element).fontSize)).toBe("15px");
  await page.screenshot({ path: testInfo.outputPath("mobile-compact.png") });

  const field = page.locator("[data-composer-field]");
  const input = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await expect.poll(async () => (await field.boundingBox())!.height).toBe(44);
  await input.fill("Primeira linha\nSegunda linha");
  await expect.poll(async () => (await field.boundingBox())!.height).toBeGreaterThan(44);
  await expect.poll(async () => (await field.boundingBox())!.height).toBeLessThan(90);
  await input.fill("");
  await expect.poll(async () => (await field.boundingBox())!.height).toBe(44);
  await expectNoHorizontalOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("teclado reduz só a conversa e mantém a posição de leitura", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page, 40);
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();

  const root = page.locator("[data-chat-root]");
  const list = page.locator("[data-swipe-back-area]");
  const input = page.getByRole("textbox", { name: "Mensagem", exact: true });
  const composer = page.locator("[data-message-composer]");
  const field = composer.locator("[data-composer-field]");
  // Simula a safe area do PWA sem depender de um modelo específico de celular.
  await page.addStyleTag({ content: '[data-chat-root]:not([data-keyboard-open="true"]) { --chat-bottom-safe-area: 34px; }' });
  const fieldBottomGap = async () => {
    const rootBox = (await root.boundingBox())!;
    const fieldBox = (await field.boundingBox())!;
    return Math.round(rootBox.y + rootBox.height - fieldBox.y - fieldBox.height);
  };
  const scrollMetrics = () => list.evaluate((element) => ({
    top: element.scrollTop,
    bottom: element.scrollHeight - element.clientHeight - element.scrollTop,
    height: element.clientHeight,
  }));
  const resizeVisualViewport = (height: number) => page.evaluate((nextHeight) => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", { configurable: true, value: nextHeight });
    Object.defineProperty(viewport, "offsetTop", { configurable: true, value: 0 });
    viewport.dispatchEvent(new Event("resize"));
  }, height);

  await expect.poll(async () => (await scrollMetrics()).bottom).toBeLessThan(2);
  await expect.poll(fieldBottomGap).toBe(34);
  const lastBubble = list.locator('[data-message-id="40"] [data-message-bubble]');
  expect((await lastBubble.boundingBox())!.y + (await lastBubble.boundingBox())!.height).toBeLessThanOrEqual((await composer.boundingBox())!.y);
  await input.focus();
  await resizeVisualViewport(500);
  await expect.poll(async () => (await root.boundingBox())!.height).toBe(500);
  await expect(root).toHaveAttribute("data-keyboard-open", "true");
  await expect.poll(fieldBottomGap).toBe(0);
  expect((await lastBubble.boundingBox())!.y + (await lastBubble.boundingBox())!.height).toBeLessThanOrEqual((await composer.boundingBox())!.y);
  await input.blur();
  // Perder o foco não fecha imediatamente o teclado no iPhone.
  await expect(root).toHaveAttribute("data-keyboard-open", "true");
  await expect.poll(fieldBottomGap).toBe(0);
  const inputBox = (await input.boundingBox())!;
  const rootBox = (await root.boundingBox())!;
  expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(rootBox.y + rootBox.height);
  expect(inputBox.y + inputBox.height).toBeGreaterThan(rootBox.y + rootBox.height - 100);
  expect((await page.getByRole("button", { name: "Voltar para conversas" }).boundingBox())!.y).toBeLessThan(80);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await scrollMetrics()).height).toBeLessThan(844);
  await expect.poll(async () => (await scrollMetrics()).bottom).toBeLessThan(2);

  // A animação de fechamento ainda ocupa parte da tela após o blur.
  await resizeVisualViewport(760);
  await expect.poll(async () => (await root.boundingBox())!.height).toBe(760);
  await expect(root).toHaveAttribute("data-keyboard-open", "true");
  await expect.poll(fieldBottomGap).toBe(0);
  await resizeVisualViewport(844);
  await expect.poll(async () => (await root.boundingBox())!.height).toBe(844);
  await expect(root).toHaveAttribute("data-keyboard-open", "false");
  await expect.poll(fieldBottomGap).toBe(34);
  await expect.poll(async () => (await scrollMetrics()).bottom).toBeLessThan(2);

  await input.focus();
  await list.evaluate((element) => { element.scrollTop = 250; });
  await expect.poll(async () => (await scrollMetrics()).top).toBe(250);
  await resizeVisualViewport(500);
  await expect.poll(async () => (await root.boundingBox())!.height).toBe(500);
  expect((await scrollMetrics()).top).toBe(250);
  await resizeVisualViewport(844);
  await expect.poll(async () => (await root.boundingBox())!.height).toBe(844);
  expect((await scrollMetrics()).top).toBe(250);

  // Também cobre navegadores que redimensionam a viewport de layout.
  await page.evaluate(() => { Reflect.deleteProperty(window.visualViewport!, "height"); });
  await page.setViewportSize({ width: 390, height: 500 });
  await expect.poll(async () => (await root.boundingBox())!.height).toBe(500);
  expect((await scrollMetrics()).top).toBe(250);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await root.boundingBox())!.height).toBe(844);
  expect((await scrollMetrics()).top).toBe(250);
  expect(runtimeErrors).toEqual([]);
});

test("rodapé usa dvh em repouso e acompanha deslocamento e retomada do teclado iOS", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, 40);
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  const root = page.locator("[data-chat-root]");
  const composer = page.locator("[data-message-composer]");
  const input = composer.getByRole("textbox", { name: "Mensagem", exact: true });
  await expect(composer).toHaveCount(1);
  await expect(composer.locator("textarea:enabled")).toHaveCount(1);
  await expect(input).toHaveAttribute("enterkeyhint", "send");
  for (const mirror of await composer.locator("[data-composer-measurement] textarea").all()) {
    await expect(mirror).toBeDisabled();
  }
  const viewport = (height: number, top: number, event: string) => page.evaluate(({ height, top, event }) => {
    Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: height });
    Object.defineProperty(window.visualViewport!, "offsetTop", { configurable: true, value: top });
    if (event === "pageshow") window.dispatchEvent(new Event(event));
    else window.visualViewport!.dispatchEvent(new Event(event));
  }, { height, top, event });
  // UI do navegador em repouso não pode reduzir outra vez o layout de 100dvh.
  await viewport(810, 5, "resize");
  await expect.poll(async () => Math.round((await root.boundingBox())!.height)).toBe(844);
  await expect.poll(async () => Math.round((await root.boundingBox())!.y)).toBe(0);
  await expect.poll(async () => composer.evaluate((element) => getComputedStyle(element).paddingBottom)).toBe("0px");
  await input.focus();
  // Retomar o PWA pode restaurar o teclado sem emitir resize.
  await viewport(500, 22, "pageshow");
  await expect(root).toHaveAttribute("data-keyboard-open", "true");
  await expect.poll(async () => Math.round((await root.boundingBox())!.y)).toBe(22);
  await expect.poll(async () => Math.round((await composer.boundingBox())!.y + (await composer.boundingBox())!.height)).toBe(522);
  await viewport(480, 30, "scroll");
  await expect.poll(async () => Math.round((await composer.boundingBox())!.y + (await composer.boundingBox())!.height)).toBe(510);
  await input.blur();
  await viewport(844, 0, "resize");
  await expect(root).toHaveAttribute("data-keyboard-open", "false");
  await expect.poll(async () => Math.round((await composer.boundingBox())!.y + (await composer.boundingBox())!.height)).toBe(844);
});

test("menu de conversas pode ser recolhido no desktop (1280px)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { runtimeErrors } = await mockApi(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Voltar para conversas" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "CotrimBot" })).toBeVisible();
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
  await expect(page.locator("#chat-sidebar")).toBeVisible();
  expect(await page.locator("[data-message-bubble]").evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");

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

test("navegação mobile anima a tela inteira e preserva scroll, dados e histórico", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page, 40, false, 30);
  let messageRequests = 0;
  page.on("request", (request) => { if (/\/contacts\/\d+\/messages\?/.test(request.url())) messageRequests++; });
  await page.goto("/");
  const panel = page.locator("[data-swipe-back-panel]");
  const sidebar = page.locator("#chat-sidebar");
  const contact = page.getByRole("button", { name: "Contato 20", exact: true });
  await contact.scrollIntoViewIfNeeded();
  const list = sidebar.locator(".compact-scroll-viewport");
  let listTop = await list.evaluate((element) => element.scrollTop);
  expect(listTop).toBeGreaterThan(0);
  await contact.click();
  // Amostra quadros reais: header, mensagens e input viajam no mesmo painel.
  await expect(panel).toHaveAttribute("data-navigation-state", "opening");
  const openingX = (await panel.boundingBox())!.x;
  expect(openingX).toBeGreaterThan(0);
  expect(openingX).toBeLessThanOrEqual(390);
  await expect(sidebar).toHaveAttribute("inert", "");
  await expect(panel).toHaveAttribute("data-navigation-state", "open");
  listTop = await list.evaluate((element) => element.scrollTop);
  await panel.evaluate((element) => { element.dataset.sameInstance = "preserved"; });
  const input = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await input.fill("Rascunho de navegação");
  const historyLength = await page.evaluate(() => window.history.length);
  const messages = page.locator("[data-swipe-back-area]");
  await messages.evaluate((element) => { element.scrollTop = 250; });
  const requestsBeforeBack = messageRequests;

  await page.getByRole("button", { name: "Voltar para conversas" }).click();
  await expect(panel).toHaveAttribute("data-navigation-state", "closing");
  await expect(panel).toHaveAttribute("data-navigation-state", "closed");
  expect(await list.evaluate((element) => element.scrollTop)).toBe(listTop);
  await page.goForward();
  await expect(panel).toHaveAttribute("data-navigation-state", "open");
  await expect(panel).toHaveAttribute("data-same-instance", "preserved");
  await expect(input).toHaveValue("Rascunho de navegação");
  expect(await messages.evaluate((element) => element.scrollTop)).toBe(250);
  expect(messageRequests).toBe(requestsBeforeBack);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  await page.goBack();
  await expect(panel).toHaveAttribute("data-navigation-state", "closed");
  expect(await list.evaluate((element) => element.scrollTop)).toBe(listTop);
  expect(runtimeErrors).toEqual([]);
});

test("redução de movimento elimina o deslocamento animado da navegação", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  const panel = page.locator("[data-swipe-back-panel]");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  await expect(panel).toHaveAttribute("data-navigation-state", "open");
  expect((await panel.boundingBox())!.x).toBe(0);
  await page.getByRole("button", { name: "Voltar para conversas" }).click();
  await expect(panel).toHaveAttribute("data-navigation-state", "closed");
});

test("deslizar para a direita retorna à lista e preserva o rascunho", async ({ page }, testInfo) => {
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
  await expect(panel).toHaveAttribute("data-navigation-state", "open");
  expect(await page.evaluate(() => Boolean(document.elementFromPoint(220, 180)?.closest("[data-swipe-back-area]")))).toBe(true);

  // Um movimento vertical e um horizontal curto não fecham a conversa.
  await touch("touchStart", 24, 180);
  await touch("touchMove", 19, 255);
  await touch("touchEnd", 19, 255);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "false");
  // O gesto iniciado no meio da tela pertence às mensagens, não à navegação.
  await touch("touchStart", 175, 180);
  await touch("touchMove", 300, 180);
  await touch("touchEnd", 300, 180);
  expect((await panel.boundingBox())!.x).toBe(0);
  await touch("touchStart", 24, 180);
  await touch("touchMove", 69, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThan(20);
  await touch("touchEnd", 69, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(1);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "false");

  // Deslizar da direita para a esquerda não fecha a conversa.
  await touch("touchStart", 24, 180);
  await touch("touchMove", 5, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBe(0);
  await touch("touchEnd", 5, 180);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "false");

  // Deslizar da esquerda para a direita retorna à lista.
  await touch("touchStart", 24, 180);
  await page.waitForTimeout(600);
  await touch("touchMove", 204, 180);
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThan(100);
  await page.screenshot({ path: testInfo.outputPath("swipe-back.png") });
  await touch("touchEnd", 204, 180);
  await expect(sidebar).toHaveAttribute("data-sidebar-open", "true");
  await expect(contactButton).toHaveAttribute("aria-current", "true");
  await contactButton.click();
  await expect(composer).toHaveValue("rascunho preservado");
  expect(runtimeErrors).toEqual([]);
});

test("segurar uma conversa no mobile abre a prévia sem abrir o chat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page);
  await page.goto("/");
  const contactButton = page.getByRole("button", { name: "Contato de teste", exact: true });
  const preview = page.getByRole("dialog", { name: "Contato de teste" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const box = (await contactButton.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await touch("touchStart", x, y);
  await touch("touchMove", x, y + 50);
  await page.waitForTimeout(600);
  await touch("touchEnd", x, y + 50);
  await expect(preview).toBeHidden();
  await expect(contactButton).toBeVisible();

  await touch("touchStart", x, y);
  await touch("touchEnd", x, y);
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar para conversas" }).click();
  await expect(contactButton).toBeVisible();

  await touch("touchStart", x, y);
  await expect(preview).toBeVisible();
  await touch("touchEnd", x, y);
  await expect(preview).toBeVisible();
  await expect(page.locator("#chat-sidebar")).toHaveAttribute("data-sidebar-open", "true");
  await touch("touchStart", 20, 30);
  await touch("touchEnd", 20, 30);
  await expect(preview).toBeHidden();
  await contactButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("segurar uma mensagem abre as ações e arrastar cancela o gesto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  const message = page.locator('[data-message-id="1"]').getByText(longWord, { exact: false });
  await expect(message).toBeVisible();
  const bubble = page.locator('[data-message-id="1"] [data-message-bubble]');
  expect(await bubble.evaluate((element) => getComputedStyle(element).userSelect)).toBe("none");
  expect(await message.evaluate((element) => getComputedStyle(element).userSelect)).toBe("none");
  expect(await bubble.evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-user-select"))).toBe("none");
  expect(await message.evaluate((element) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))).toBe(false);
  expect(await page.getByRole("textbox", { name: "Mensagem", exact: true }).evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
  const menu = page.getByRole("menu", { name: "Ações da mensagem" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const center = async () => {
    const box = (await message.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  let point = await center();
  await touch("touchStart", point.x, point.y);
  await touch("touchEnd", point.x, point.y);
  await expect(menu).toBeHidden();

  point = await center();
  await touch("touchStart", point.x, point.y);
  await touch("touchMove", point.x, point.y + 70);
  await page.waitForTimeout(600);
  await touch("touchEnd", point.x, point.y + 70);
  await expect(menu).toBeHidden();

  point = await center();
  await touch("touchStart", point.x, point.y);
  await expect(menu).toBeVisible();
  await touch("touchEnd", point.x, point.y);
  await expect(menu).toBeVisible();
  await touch("touchStart", 20, 100);
  await touch("touchEnd", 20, 100);
  await expect(menu).toBeHidden();

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (value: string) => { document.documentElement.dataset.copiedMessage = value; },
    });
  });
  await bubble.getByRole("button", { name: "Ações da mensagem" }).click();
  await menu.getByRole("menuitem", { name: "Copiar" }).click();
  await expect(menu).toBeHidden();
  expect(await page.locator("html").getAttribute("data-copied-message")).toContain(longWord);
  expect(runtimeErrors).toEqual([]);
});
