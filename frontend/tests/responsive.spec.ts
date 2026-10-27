import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const longWord = "a".repeat(160);

for (const width of [1280, 390]) {
  test(`GIF conecta GIPHY busca prepara animação e envia só após confirmação (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const sample = await readFile(path.join(__dirname, "fixtures/gif-preview.mp4"));
    const { runtimeErrors } = await mockApi(page);
    const sent: { gifPlayback: FormDataEntryValue | null; name: string; type: string }[] = [];
    let failDownload = true;
    const item = (id: string, title: string) => ({ id, title, images: { fixed_width: { url: `https://media.giphy.com/media/${id}/preview.gif` }, original: { url: `https://media.giphy.com/media/${id}/giphy.gif`, mp4: `https://media.giphy.com/media/${id}/giphy.mp4` } } });
    await page.route("https://api.giphy.com/v1/gifs/**", (route) => {
      const url = new URL(route.request().url());
      const headers = { "access-control-allow-origin": "*" };
      if (url.searchParams.get("api_key") === "bad-key") return route.fulfill({ status: 403, headers, json: {} });
      if (url.searchParams.get("q") === "limite") return route.fulfill({ status: 429, headers, json: {} });
      const more = url.searchParams.get("q") === "gato";
      const offset = Number(url.searchParams.get("offset") || 0);
      return route.fulfill({ headers, json: { data: [more && offset ? item("cat", "Gato feliz") : item("happy", "Feliz")], pagination: { total_count: more ? 2 : 1, offset, count: 1 } } });
    });
    await page.route("https://media.giphy.com/media/**", (route) => {
      const headers = { "access-control-allow-origin": "*" };
      if (route.request().url().endsWith(".mp4")) return failDownload ? route.fulfill({ status: 500, headers, body: "temporarily unavailable" }) : route.fulfill({ headers, contentType: "video/mp4", body: Buffer.from(sample) });
      return route.fulfill({ headers, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#8b5cf6"/><text x="70" y="94" fill="white" font-size="32">GIF</text></svg>' });
    });
    await page.route("**/contacts/1/send-media", async (route) => {
      const form = await new Response(new Uint8Array(route.request().postDataBuffer()!).buffer, { headers: { "content-type": route.request().headers()["content-type"]! } }).formData();
      const file = form.get("file") as File;
      sent.push({ gifPlayback: form.get("gifPlayback"), name: file.name, type: file.type });
      await route.fulfill({ json: { message: {} } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    const composer = page.locator("[data-message-composer]");
    const openGifs = async () => {
      await composer.getByRole("button", { name: "Abrir emojis", exact: true }).click();
      await page.getByRole("button", { name: "GIFs", exact: true }).click();
    };
    await openGifs();
    await expect(page.getByRole("heading", { name: "Conectar ao GIPHY" })).toBeVisible();
    await page.getByLabel("Chave da API GIPHY").fill("bad-key");
    await page.getByRole("button", { name: "Conectar GIPHY", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Chave GIPHY inválida" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("cotrimbot:giphy-api-key"))).toBeNull();
    await page.getByLabel("Chave da API GIPHY").fill("valid-test-key");
    await page.getByRole("button", { name: "Conectar GIPHY", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Pesquisar GIFs", exact: true });
    await expect(search).toBeVisible();
    await search.fill("limite");
    await expect(page.getByRole("alert").filter({ hasText: "Limite de buscas" })).toBeVisible();
    await search.fill("gato");
    await expect(page.getByRole("button", { name: "Escolher GIF: Feliz", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Carregar mais GIFs", exact: true }).click();
    const choice = page.getByRole("button", { name: "Escolher GIF: Gato feliz", exact: true });
    await expect(choice).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("gif-search.png") });
    await choice.click();
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível preparar este GIF" })).toBeVisible();
    failDownload = false;
    await choice.click();
    const preview = composer.locator('video[aria-label="Prévia de gif-cat.mp4"]');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("loop", "");
    await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
    await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);
    expect(sent).toEqual([]);
    await composer.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect.poll(() => sent).toEqual([{ gifPlayback: "true", name: "gif-cat.mp4", type: "video/mp4" }]);
    await expect(preview).toHaveCount(0);
    await page.reload();
    if (width >= 1024) await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    else await expect(composer.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
    await openGifs();
    await expect(search).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("cotrimbot:giphy-api-key"))).toBe("valid-test-key");
    expect(runtimeErrors).toEqual([]);
  });
}

for (const width of [1280, 390]) {
  test(`tema claro escuro e sistema persistem nas configurações (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    const { runtimeErrors } = await mockApi(page, 3);
    await page.goto("/");
    const openTheme = async () => {
      // O acesso atual às configurações fica na barra de navegação do desktop.
      await page.setViewportSize({ width: 1280, height: 900 });
      const back = page.getByRole("button", { name: "Voltar para conversas", exact: true });
      if (await back.isVisible()) await back.click();
      await page.getByRole("button", { name: "Abrir configurações de Teste local" }).click();
      await page.getByRole("tab", { name: "Tema", exact: true }).click();
      await page.setViewportSize({ width, height: 900 });
    };
    await openTheme();
    await expect(page.getByRole("radio", { name: /^Escuro/ })).toBeChecked();
    await page.getByText("Claro", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.getByRole("dialog").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
    await expect.poll(() => page.getByRole("radio", { name: /^Claro/ }).evaluate((element) => getComputedStyle(element.parentElement!).backgroundColor)).toBe("rgb(255, 255, 255)");
    await page.screenshot({ path: testInfo.outputPath("theme-settings-light.png") });
    await page.getByRole("button", { name: "Fechar configurações", exact: true }).click();
    await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    await expect.poll(() => page.locator('[data-message-id="1"] [data-message-bubble]').evaluate((element) => getComputedStyle(element).color)).toBe("rgb(24, 24, 27)");
    await expect(page.locator('[data-message-id="3"]')).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath("chat-light.png") });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await openTheme();
    await expect(page.getByRole("radio", { name: /^Claro/ })).toBeChecked();
    await page.getByText("Sistema", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radio", { name: /^Sistema/ })).toBeChecked();
    await page.getByText("Escuro", { exact: true }).click();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("cotrimbot:theme"))).toBe("dark");
    await page.screenshot({ path: testInfo.outputPath("theme-settings-dark.png") });
    expect(runtimeErrors).toEqual([]);
  });
}

test("tirar print seleciona início e fim e gera o trecho inteiro em PNG", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { value: () => { throw new Error("Não deve capturar a tela do computador"); } });
    new MutationObserver(() => {
      const snapshot = document.querySelector("[data-conversation-print]");
      if (!snapshot) return;
      document.documentElement.dataset.printIds = Array.from(snapshot.querySelectorAll("[data-message-id]")).map((row) => row.getAttribute("data-message-id")).join(",");
      document.documentElement.dataset.printControls = String(snapshot.querySelectorAll("[data-print-exclude]").length);
      document.documentElement.dataset.printBrand = snapshot.querySelector("[data-print-brand]")?.textContent ?? "";
      document.documentElement.dataset.printLogo = String(Boolean(snapshot.querySelector("[data-print-logo]")));
    }).observe(document, { childList: true, subtree: true });
  });
  const { runtimeErrors } = await mockApi(page, 25);
  let mediaRequests = 0;
  await page.route("**/contacts/1/send-media", (route) => { mediaRequests++; return route.fulfill({ json: {} }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  await page.getByRole("button", { name: "Mais opções", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tirar print", exact: true }).click();
  const toolbar = page.getByRole("region", { name: "Selecionar trecho para print" });
  await expect(toolbar).toContainText("Selecione a mensagem inicial");
  await expect(toolbar.getByRole("button", { name: "Gerar print", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Definir início do print na mensagem 2", exact: true }).click();
  await expect(toolbar).toContainText("Agora selecione a mensagem final");
  await page.getByRole("button", { name: "Definir fim do print na mensagem 20", exact: true }).click();
  await expect(toolbar).toContainText("19 mensagens no print");
  await expect(page.locator('[data-print-selected="true"]')).toHaveCount(19);
  await page.screenshot({ path: testInfo.outputPath("print-selection-gray.png") });
  await toolbar.getByRole("button", { name: "Gerar print", exact: true }).click();
  const preview = page.getByRole("img", { name: /^Prévia de print-conversa-\d+\.png$/ });
  await expect(preview).toBeVisible();
  await expect(toolbar).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-print-ids", Array.from({ length: 19 }, (_, i) => i + 2).join(","));
  await expect(page.locator("html")).toHaveAttribute("data-print-controls", "0");
  await expect(page.locator("html")).toHaveAttribute("data-print-brand", "CotrimBot");
  await expect(page.locator("html")).toHaveAttribute("data-print-logo", "true");
  await expect(page.locator("[data-conversation-print]")).toHaveCount(0);
  const image = await preview.evaluate(async (element: HTMLImageElement) => {
    const blob = await (await fetch(element.src)).blob();
    const bitmap = await createImageBitmap(blob);
    const result = { type: blob.type, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  });
  expect(image.type).toBe("image/png");
  expect(image.width).toBeGreaterThan(600);
  expect(image.height).toBeGreaterThan(1600);
  const bytes = await preview.evaluate(async (element: HTMLImageElement) => Array.from(new Uint8Array(await (await fetch(element.src)).arrayBuffer())));
  await writeFile(testInfo.outputPath("conversation-range.png"), Buffer.from(bytes));
  expect(mediaRequests).toBe(0);
  await page.getByRole("button", { name: /^Remover print-conversa-\d+\.png$/ }).click();
  await expect(preview).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("tirar print inclui mensagens enviadas, foto, vídeo e eventos do intervalo", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const avatar = document.querySelector<HTMLImageElement>("[data-conversation-print] [data-print-avatar]");
      if (avatar) document.documentElement.dataset.printAvatarPresent = "true";
    }).observe(document, { childList: true, subtree: true });
  });
  const { runtimeErrors } = await mockApi(page);
  const avatarUrl = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#60a5fa"/><circle cx="40" cy="28" r="14" fill="#fff"/><ellipse cx="40" cy="70" rx="27" ry="24" fill="#fff"/></svg>').toString("base64")}`;
  await page.route("**/api/contacts", (route) => route.fulfill({ json: [{ id: 1, name: "Contato de teste", phone: "5511999999999", isGroup: false, archived: false, unreadCount: 0, profilePictureUrl: avatarUrl, messages: [{ id: 1, content: "Conversa de teste", type: "TEXT", direction: "INCOMING", createdAt: new Date().toISOString() }] }] }));
  await page.route("**/api/contacts/1/avatar", (route) => route.fulfill({ json: { profilePictureUrl: avatarUrl } }));
  await page.route("**/api/contacts/1/messages*", (route) => {
    if (!new URL(route.request().url()).pathname.endsWith("/messages")) return route.fallback();
    const examples = [
      { type: "TEXT", content: "Antes do trecho" },
      { type: "TEXT", content: "Início da conversa 👋", direction: "OUTGOING" },
      { type: "SYSTEM", content: "Você atribuiu para o bot" },
      { type: "IMAGE", content: "Foto da conversa" },
      { type: "VIDEO", content: "[Vídeo]" },
      { type: "TEXT", content: "Fim da conversa" },
      { type: "TEXT", content: "Depois do trecho" },
    ];
    return route.fulfill({ json: { messages: examples.map((example, index) => ({ direction: "INCOMING", ...example, id: index + 1, externalId: `mixed-${index}`, contactId: 1, private: false, createdAt: new Date().toISOString() })), hasMore: false, nextCursor: null } });
  });
  await page.route("**/api/messages/4/media", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><rect width="280" height="160" fill="#34d399"/><text x="20" y="80" font-size="24">Foto no trecho</text></svg>' }));
  await page.route("**/api/messages/5/media*", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  const liveAvatar = page.locator('[data-chat-header] img[alt="Contato de teste"]');
  await expect(liveAvatar).toBeVisible();
  await expect.poll(() => liveAvatar.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Mais opções", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tirar print", exact: true }).click();
  await page.getByRole("button", { name: "Definir início do print na mensagem 2", exact: true }).click();
  await page.getByRole("button", { name: "Definir fim do print na mensagem 6", exact: true }).click();
  const toolbar = page.getByRole("region", { name: "Selecionar trecho para print" });
  await expect(toolbar).toContainText("5 mensagens no print");
  await toolbar.getByRole("button", { name: "Gerar print", exact: true }).click();
  const preview = page.getByRole("img", { name: /^Prévia de print-conversa-\d+\.png$/ });
  await expect(preview).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-print-avatar-present", "true");
  const bytes = await preview.evaluate(async (element: HTMLImageElement) => Array.from(new Uint8Array(await (await fetch(element.src)).arrayBuffer())));
  await writeFile(testInfo.outputPath("conversation-mixed.png"), Buffer.from(bytes));
  expect(runtimeErrors).toEqual([]);
});

test("tirar print não falha quando foto externa ou mídia bloqueiam exportação", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const snapshot = document.querySelector("[data-conversation-print]");
      if (snapshot?.textContent?.includes("Imagem indisponível")) document.documentElement.dataset.printUnavailableImage = "true";
    }).observe(document, { childList: true, subtree: true });
  });
  const { runtimeErrors } = await mockApi(page, 3);
  const avatarUrl = "https://avatar.example.invalid/person.svg";
  await page.route(avatarUrl, (route) => route.fulfill({ contentType: "image/svg+xml", headers: { "cache-control": "no-store" }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#60a5fa"/></svg>' }));
  await page.route("**/api/contacts", (route) => route.fulfill({ json: [{ id: 1, name: "Contato de teste", phone: "5511999999999", isGroup: false, archived: false, unreadCount: 0, profilePictureUrl: avatarUrl, messages: [{ id: 1, content: "Teste", type: "TEXT", direction: "INCOMING", createdAt: new Date().toISOString() }] }] }));
  await page.route("**/api/contacts/1/messages*", (route) => {
    if (!new URL(route.request().url()).pathname.endsWith("/messages")) return route.fallback();
    return route.fulfill({ json: { messages: [1, 2, 3].map((id) => ({ id, externalId: `blocked-${id}`, contactId: 1, type: id === 2 ? "IMAGE" : "TEXT", content: id === 2 ? "Foto com acesso expirado" : `Mensagem ${id}`, direction: "INCOMING", private: false, createdAt: new Date().toISOString() })), hasMore: false, nextCursor: null } });
  });
  await page.route("**/api/messages/2/media", (route) => route.request().resourceType() === "fetch" ? route.fulfill({ status: 403, body: "Acesso expirado" }) : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160"><rect width="280" height="160" fill="#60a5fa"/></svg>' }));
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  const photo = page.locator('[data-chat-header] img[alt="Contato de teste"]');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(80);
  await page.getByRole("button", { name: "Mais opções", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tirar print", exact: true }).click();
  await page.getByRole("button", { name: "Definir início do print na mensagem 1", exact: true }).click();
  await page.getByRole("button", { name: "Definir fim do print na mensagem 3", exact: true }).click();
  await page.getByRole("button", { name: "Gerar print", exact: true }).click();
  await expect(page.getByRole("img", { name: /^Prévia de print-conversa-\d+\.png$/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-print-unavailable-image", "true");
  await expect(page.getByRole("region", { name: "Selecionar trecho para print" })).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("tirar print limita dimensões de trechos longos sem cortar mensagens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { runtimeErrors } = await mockApi(page, 140);
  await page.goto("/");
  await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
  await page.getByRole("button", { name: "Mais opções", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tirar print", exact: true }).click();
  await page.getByRole("button", { name: "Definir início do print na mensagem 1", exact: true }).click();
  await page.getByRole("button", { name: "Definir fim do print na mensagem 140", exact: true }).click();
  await expect(page.locator('[data-print-selected="true"]')).toHaveCount(140);
  await page.getByRole("button", { name: "Gerar print", exact: true }).click();
  const preview = page.getByRole("img", { name: /^Prévia de print-conversa-\d+\.png$/ });
  await expect(preview).toBeVisible({ timeout: 20000 });
  const size = await preview.evaluate(async (element: HTMLImageElement) => {
    const bitmap = await createImageBitmap(await (await fetch(element.src)).blob());
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  });
  expect(size.height).toBeGreaterThan(8000);
  expect(size.height).toBeLessThanOrEqual(16000);
  expect(size.width * size.height).toBeLessThanOrEqual(24000000);
  expect(runtimeErrors).toEqual([]);
});

  test("tirar print permite recomeçar, inverter os limites e cancelar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const { runtimeErrors } = await mockApi(page, 8);
    await page.goto("/");
    await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    await page.getByRole("button", { name: "Mais opções", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tirar print", exact: true }).click();
    const toolbar = page.getByRole("region", { name: "Selecionar trecho para print" });
    await page.getByRole("button", { name: "Definir início do print na mensagem 7", exact: true }).click();
    await page.getByRole("button", { name: "Definir fim do print na mensagem 3", exact: true }).click();
    await expect(toolbar).toContainText("5 mensagens no print");
    await toolbar.getByRole("button", { name: "Recomeçar", exact: true }).click();
    await expect(toolbar).toContainText("Selecione a mensagem inicial");
    await expect(page.locator('[data-print-selected="true"]')).toHaveCount(0);
    await toolbar.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(toolbar).toHaveCount(0);
    await expect(page.getByRole("img", { name: /^Prévia de print-/ })).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
  });

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
    // enquanto anexos e microfone ficam fora da cápsula de texto.
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
    await expect(composer.getByRole("button", { name: "Abrir câmera", exact: true })).toHaveCount(0);
    const microphone = composer.getByRole("button", { name: "Gravar áudio", exact: true });
    await expect(input).toHaveCount(1);
    for (const control of [field, attachments, emojis, microphone]) await expect(control).toBeVisible();
    await expect(composer.getByRole("button", { name: "Enviar mensagem", exact: true })).toBeHidden();
    const [fieldBox, inputBox, attachmentsBox, emojiBox, microphoneBox] = await Promise.all(
      [field, input, attachments, emojis, microphone].map((control) => control.boundingBox()),
    );
    expect(attachmentsBox!.x + attachmentsBox!.width).toBeLessThanOrEqual(fieldBox!.x + 1);
    expect(fieldBox!.x + fieldBox!.width).toBeLessThanOrEqual(microphoneBox!.x + 1);
    expect(microphoneBox!.x - fieldBox!.x - fieldBox!.width).toBeLessThanOrEqual(9);
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

for (const width of [320, 390, 768]) {
  test(`anexos mobile abrem painel inferior em grade (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const { runtimeErrors } = await mockApi(page, 20);
    await page.goto("/");
    await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    const composer = page.locator("[data-message-composer]");
    const input = composer.getByRole("textbox", { name: "Mensagem", exact: true });
    await input.fill("Mensagem em edição");
    const trigger = composer.getByRole("button", { name: "Abrir anexos", exact: true });
    await trigger.click();
    const panel = page.locator("[data-mobile-attachment-panel]");
    await expect(panel).toBeVisible();
    for (const name of ["Fotos", "Vídeo", "Áudio", "Documento", "Enquete"]) {
      await expect(panel.getByRole("menuitem", { name, exact: true })).toBeVisible();
    }
    await expect(panel.getByRole("menuitemcheckbox", { name: "Mensagem privada", exact: true })).toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => {
      const box = (await panel.boundingBox())!;
      const field = (await composer.locator("[data-composer-field]").boundingBox())!;
      const send = (await composer.getByRole("button", { name: "Enviar mensagem", exact: true }).boundingBox())!;
      return box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 844 && field.y + field.height <= box.y && Math.abs(send.y + send.height - field.y - field.height) < 2;
    }).toBe(true);
    const photos = (await panel.getByRole("menuitem", { name: "Fotos", exact: true }).boundingBox())!;
    const document = (await panel.getByRole("menuitem", { name: "Documento", exact: true }).boundingBox())!;
    expect(Math.abs(photos.y - document.y)).toBeLessThan(2);
    const signature = panel.getByRole("menuitemcheckbox", { name: "Assinar mensagens", exact: true });
    const previous = await signature.getAttribute("aria-checked");
    await signature.click();
    await expect(signature).toHaveAttribute("aria-checked", previous === "true" ? "false" : "true");
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("mobile-attachment-panel.png") });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(input).toHaveValue("Mensagem em edição");
    await trigger.click();
    await expect(panel).toBeVisible();
    await page.locator("[data-chat-header]").click({ position: { x: 5, y: 5 } });
    await expect(panel).toBeHidden();
    expect(runtimeErrors).toEqual([]);
  });
}

test("composer mobile anexa imagem e abre emojis e troca microfone por envio", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { runtimeErrors } = await mockApi(page);
  const sentTexts: string[] = [];
  const sentPrivacy: boolean[] = [];
  await page.route("**/contacts/1/send", async (route) => {
    const payload = route.request().postDataJSON() as { text: string; clientId: string; private: boolean };
    sentTexts.push(payload.text);
    sentPrivacy.push(payload.private);
    await route.fulfill({ json: { message: {
      id: sentTexts.length + 1, externalId: `sent-${sentTexts.length + 1}`, contactId: 1, content: payload.text,
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
  await expect(composer.getByRole("button", { name: "Abrir câmera", exact: true })).toHaveCount(0);
  await composer.getByRole("button", { name: "Abrir anexos", exact: true }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Fotos", exact: true }).click();
  const chooser = await chooserPromise;
  expect(await chooser.element().getAttribute("accept")).toBe("image/*");
  expect(await chooser.element().getAttribute("capture")).toBeNull();
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
  await composer.getByRole("button", { name: "Abrir anexos", exact: true }).click();
  const privateOption = page.getByRole("menuitemcheckbox", { name: "Mensagem privada", exact: true });
  await privateOption.click();
  await expect(composer).toHaveAttribute("data-private", "true");
  await expect(page.locator("[data-mobile-attachment-panel]")).toBeHidden();
  await expect(input).toHaveAttribute("placeholder", "Digite uma mensagem privada...");
  const field = composer.locator("[data-composer-field]");
  const attachments = composer.getByRole("button", { name: "Abrir anexos", exact: true });
  const emojis = composer.getByRole("button", { name: "Abrir emojis", exact: true });
  for (const control of [field, attachments, emojis, microphone]) {
    await expect.poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  }
  await page.screenshot({ path: testInfo.outputPath("mobile-private-white.png") });
  await input.fill("Nota interna de teste");
  await expect.poll(() => send.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect.poll(() => send.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(63, 63, 70)");
  await send.click();
  await expect.poll(() => sentPrivacy).toEqual([false, true]);
  await expect(page.locator('[data-message-id="3"] [data-message-bubble]')).toHaveAttribute("data-private", "true");
  await composer.getByRole("button", { name: "Abrir anexos", exact: true }).click();
  await expect(privateOption).toHaveAttribute("aria-checked", "true");
  await privateOption.click();
  await expect(composer).toHaveAttribute("data-private", "false");
  await expect(input).toHaveAttribute("placeholder", "Digite uma mensagem...");
  await expect.poll(() => attachments.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(36, 36, 38)");
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

for (const installedMode of ["ios", "standalone"] as const) {
  test(`PWA ${installedMode} não reserva faixa abaixo do campo`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((mode) => {
      if (mode === "ios") {
        Object.defineProperty(navigator, "standalone", { value: true });
      } else {
        const matchMedia = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const result = matchMedia(query);
          if (query.includes("display-mode: standalone")) Object.defineProperty(result, "matches", { value: true });
          return result;
        };
      }
    }, installedMode);
    const { runtimeErrors } = await mockApi(page, 40);
    await page.goto("/");
    await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    // Simula o inset do iPhone; a regra de PWA deve removê-lo do rodapé.
    await page.addStyleTag({ content: '[data-chat-root] { --chat-bottom-safe-area: 34px; }' });
    const root = page.locator("[data-chat-root]");
    const composer = page.locator("[data-message-composer]");
    const field = composer.locator("[data-composer-field]");
    const input = composer.getByRole("textbox", { name: "Mensagem", exact: true });
    const fieldBottom = async () => {
      const box = (await field.boundingBox())!;
      return Math.round(box.y + box.height);
    };
    await expect(root).toHaveAttribute("data-standalone", "true");
    await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).paddingBottom)).toBe("0px");
    await expect.poll(fieldBottom).toBe(844);
    await input.focus();
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 500 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(root).toHaveAttribute("data-keyboard-open", "true");
    await expect.poll(fieldBottom).toBe(500);
    await input.blur();
    await page.evaluate(() => {
      Reflect.deleteProperty(window.visualViewport!, "height");
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(root).toHaveAttribute("data-keyboard-open", "false");
    await expect.poll(fieldBottom).toBe(844);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`pwa-${installedMode}-footer.png`) });
    expect(runtimeErrors).toEqual([]);
  });
}

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
  for (const surface of ["html", "body", "[data-chat-root]", "[data-chat-header]", "[data-message-list-content]", "[data-message-composer]", '[data-message-id="1"] [role="separator"]']) {
    expect(await page.locator(surface).evaluate((element) => getComputedStyle(element).userSelect)).toBe("none");
  }
  expect(await message.evaluate((element) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))).toBe(false);
  expect(await page.getByRole("textbox", { name: "Mensagem", exact: true }).evaluate((element) => getComputedStyle(element).userSelect)).not.toBe("none");
  const input = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await input.fill("Texto editável");
  await input.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 5));
  expect(await input.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd))).toBe("Texto");
  await input.fill("");
  await input.blur();
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

for (const width of [320, 390, 1280]) {
  test(`menu de ações da mensagem permanece dentro da tela (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    const { runtimeErrors } = await mockApi(page);
    await page.route("**/api/contacts/1/messages*", (route) => {
      if (!new URL(route.request().url()).pathname.endsWith("/messages")) return route.fallback();
      const examples = [
        { type: "TEXT", content: "Oi" },
        { type: "TEXT", content: longWord },
        { type: "AUDIO", content: "[Áudio]" },
        { type: "IMAGE", content: "[Imagem]" },
      ];
      const messages = ["INCOMING", "OUTGOING"].flatMap((direction, directionIndex) => examples.map((example, index) => ({
        ...example, id: directionIndex * examples.length + index + 1,
        externalId: `menu-${direction}-${index}`, direction, contactId: 1,
        createdAt: new Date().toISOString(), private: false,
      })));
      return route.fulfill({ json: { messages, hasMore: false, nextCursor: null } });
    });
    await page.route("**/api/messages/*/media", (route) => route.abort());
    await page.goto("/");
    await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    for (let id = 1; id <= 8; id++) {
      const trigger = page.locator(`[data-message-id="${id}"]`).getByRole("button", { name: "Ações da mensagem", exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Ações da mensagem", exact: true });
      await expect(menu).toBeVisible();
      await expect.poll(async () => {
        const box = (await menu.boundingBox())!;
        return box.x >= 11 && box.y >= 11 && box.x + box.width <= width - 11 && box.y + box.height <= 689;
      }).toBe(true);
      await expect(menu.getByRole("menuitem", { name: "Encaminhar", exact: true })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Apagar", exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      if (id === 3) await page.screenshot({ path: testInfo.outputPath("incoming-audio-actions.png") });
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    }
    expect(runtimeErrors).toEqual([]);
  });
}

for (const width of [320, 480, 1280]) {
  test(`menu de modelos de áudio permanece dentro da tela (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    const { runtimeErrors } = await mockApi(page);
    const updates: unknown[] = [];
    await page.route("**/api/contacts/1/messages*", (route) => {
      if (!new URL(route.request().url()).pathname.endsWith("/messages")) return route.fallback();
      return route.fulfill({ json: { messages: ["INCOMING", "OUTGOING"].map((direction, index) => ({
        id: index + 1, externalId: `audio-${index}`, content: "Áudio", type: "AUDIO", direction,
        contactId: 1, createdAt: new Date().toISOString(), private: false,
      })), hasMore: false, nextCursor: null } });
    });
    await page.route("**/api/messages/*/media", (route) => route.abort());
    await page.route("**/api/transcription/settings", async (route) => {
      if (route.request().method() === "PUT") updates.push(route.request().postDataJSON());
      await route.fulfill({ json: { model: "base", beam_size: 5, vad_filter: true, language: "pt" } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Contato de teste", exact: true }).click();
    const triggers = page.getByRole("button", { name: "Configurações de transcrição" });
    await expect(triggers).toHaveCount(2);
    for (const trigger of [triggers.first(), triggers.last()]) {
      await trigger.click();
      const popup = page.getByRole("dialog", { name: "Modelo de transcrição" });
      await expect(popup).toBeVisible();
      await expect(popup.getByRole("radio", { name: "Base", exact: true })).toBeChecked();
      await expect.poll(async () => {
        const box = await popup.boundingBox();
        return !!box && box.x >= 11 && box.y >= 11 && box.x + box.width <= width - 11 && box.y + box.height <= 689;
      }).toBe(true);
      await expectNoHorizontalOverflow(page);
      await popup.getByText("Medium", { exact: true }).click();
      await expect(popup.getByRole("radio", { name: "Medium", exact: true })).toBeChecked();
      await page.screenshot({ path: testInfo.outputPath(`audio-modelo-${await trigger.getAttribute("aria-controls")}.png`) });
      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ model: "medium" });
    expect(runtimeErrors).toEqual([]);
  });
}
