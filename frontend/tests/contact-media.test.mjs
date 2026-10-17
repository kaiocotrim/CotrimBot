import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("contact information scopes media, documents, links and pagination, and can return from all conversations", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "contact-media.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {ContactInfoPanel} from "@/components/chat/contact-info-panel";
      const noop = async () => {};
      createRoot(document.getElementById("root")).render(<ContactInfoPanel
        contact={{id: 7, name: "Contato de teste", phone: "5511999999999", isGroup: false, isSaved: true, archived: false, unreadCount: 0}}
        onClose={noop} onSearch={noop} onRenameContact={noop} onSetContactAssignment={noop}
        onSetContactPriority={noop} onCloseWithBot={noop} onStartConversation={noop} closing={false}
      />);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 384, height: 860 }, acceptDownloads: true, reducedMotion: "reduce" });
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let summaryError = true;
    let empty = false;
    const item = (id, type = "IMAGE") => ({ id, type, content: "Arquivo compartilhado", createdAt: "2026-10-16T15:00:00Z", contactId: 7, contactName: "Contato de teste", senderName: "Pessoa", fileName: type === "DOCUMENT" ? "manual.pdf" : null, mimeType: null, links: type === "TEXT" ? ["https://example.com/manual"] : [] });
    await page.route("http://contact.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/media-library") {
        requests.push(url.searchParams);
        if (url.searchParams.has("summary")) {
          await route.fulfill(summaryError ? { status: 500, json: {} } : { json: { count: empty ? 0 : 15, items: empty ? [] : [1, 2, 3, 4].map((id) => item(id)) } });
          return;
        }
        const tab = url.searchParams.get("tab");
        const cursor = url.searchParams.get("cursor");
        await route.fulfill({ json: {
          items: empty ? [] : tab === "documents" ? [item(80, "DOCUMENT")] : tab === "links" ? [item(90, "TEXT")] : cursor ? [item(13)] : Array.from({ length: 12 }, (_, index) => item(index + 1)),
          hasMore: !empty && tab === "media" && !cursor, nextCursor: 12,
        } });
      } else if (url.pathname.includes("/messages/")) {
        await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#27272a"/><circle cx="100" cy="80" r="40" fill="#71717a"/><path d="M20 200 100 120 180 200" fill="#a1a1aa"/></svg>' });
      } else if (url.pathname === "/api/clients") await route.fulfill({ json: { clients: [] } });
      else if (url.pathname.startsWith("/api/")) await route.fulfill({ json: [] });
      else await route.fulfill({ contentType: "text/html", body: '<div id="root" style="position:relative;height:100dvh;width:100%;background:#000"></div>' });
    });
    await page.goto("http://contact.test/");
    await page.addStyleTag({ content: css.css });
    await page.addStyleTag({ content: bundle.outputFiles.find((file) => file.path.endsWith(".css")).text });
    await page.addScriptTag({ content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text });
    await expect(page.getByRole("alert")).toHaveText("Não foi possível carregar as mídias.");
    summaryError = false;
    await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    const summary = page.getByRole("button", { name: "Abrir mídia, links e docs" });
    await expect(summary).toContainText("15");
    await expect(summary.locator("img")).toHaveCount(4);
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-contact-info-media.png") });
    await summary.click();
    await expect(page.getByRole("button", { name: /^Imagem de/ })).toHaveCount(12);
    await page.getByRole("button", { name: "Carregar mais", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Imagem de/ })).toHaveCount(13);
    await page.getByRole("button", { name: /^Imagem de/ }).first().click();
    await expect(page.getByRole("button", { name: "Fechar visualização" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Fechar visualização" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Documentos", exact: true }).click();
    await expect(page.getByText("manual.pdf", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar manual.pdf", exact: true }).click();
    assert.equal((await download).suggestedFilename(), "manual.pdf");
    await page.getByRole("tab", { name: "Links", exact: true }).click();
    await expect(page.getByRole("link", { name: "https://example.com/manual" })).toBeVisible();
    assert.ok(requests.every((query) => query.get("contactId") === "7"));
    assert.ok(requests.some((query) => query.get("cursor") === "12"));
    await page.getByRole("tab", { name: "Mídias", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Imagem de/ })).toHaveCount(12);
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-contact-media-grid.png") });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await expect(page.getByRole("tab", { name: "Documentos", exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Ver mídias de todas as conversas" }).click();
    await expect.poll(() => requests.at(-1).has("contactId")).toBe(false);
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect.poll(() => requests.at(-1).get("contactId")).toBe("7");
    empty = true;
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Nenhum conteúdo compartilhado ainda");
    await summary.click();
    await expect(page.getByText("Nenhuma mídia encontrada", { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
