import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

test("media library loads skeletons, previews, tabs, search, selection and more pages", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const result = await build({
    absWorkingDir: frontend, outfile: "library.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `import React from "react"; import {createRoot} from "react-dom/client"; import {MediaLibrary} from "@/components/chat/media-library"; createRoot(document.getElementById("root")).render(<MediaLibrary />);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 920 }, acceptDownloads: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests = [];
    let release;
    const firstResponse = new Promise((resolve) => { release = resolve; });
    const item = (id, type = "IMAGE") => ({ id, type, content: "Arquivo compartilhado", createdAt: "2026-10-16T15:00:00Z", contactId: 1, contactName: "Conversa de teste", senderName: "Pessoa de teste", fileName: type === "DOCUMENT" ? "manual.pdf" : null, mimeType: null, links: type === "TEXT" ? ["https://example.com/manual"] : [] });
    await page.route("http://library.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/media-library") {
        requests.push(url.searchParams.toString());
        if (requests.length === 1) await firstResponse;
        const tab = url.searchParams.get("tab");
        const cursor = url.searchParams.get("cursor");
        const data = url.searchParams.get("q") === "inexistente" ? [] : tab === "documents" ? [item(80, "DOCUMENT")] : tab === "links" ? [item(90, "TEXT")] : cursor ? [item(13)] : Array.from({ length: 12 }, (_, index) => item(index + 1));
        await route.fulfill({ json: { items: data, hasMore: tab === "media" && !cursor && data.length > 0, nextCursor: tab === "media" && !cursor ? 12 : null } });
      } else if (url.pathname.includes("/messages/")) {
        const id = Number(url.pathname.split("/")[3]);
        await route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${id % 2 ? "#52525b" : "#3f3f46"}"/><circle cx="200" cy="160" r="70" fill="#71717a"/><path d="M50 400 200 230 350 400" fill="#a1a1aa"/></svg>` });
      } else await route.fulfill({ contentType: "text/html", body: '<style>*{box-sizing:border-box}body{margin:0;font:14px Arial;background:#050505;color:#eee}button,input{font:inherit;color:inherit;background:none;border:0}button{cursor:pointer}a{color:inherit;text-decoration:none}svg{flex-shrink:0}</style><div id="root"></div>' });
    });
    await page.goto("http://library.test/");
    await page.addStyleTag({ content: result.outputFiles.find((file) => file.path.endsWith(".css")).text });
    await page.addScriptTag({ content: result.outputFiles.find((file) => file.path.endsWith(".js")).text });
    await page.getByRole("button", { name: "Mídias de todas as conversas" }).click();
    await expect(page.getByRole("status", { name: "Carregando biblioteca" })).toBeVisible();
    release();
    await expect(page.getByRole("button", { name: /^Imagem de/ })).toHaveCount(12);
    await page.getByRole("button", { name: /^Imagem de/ }).first().click();
    await expect(page.getByRole("button", { name: "Fechar visualização" })).toBeVisible();
    await page.getByRole("button", { name: "Próxima mídia" }).click();
    await expect(page.getByRole("button", { name: "Mídia anterior" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar mídia", exact: true }).click();
    assert.match((await download).suggestedFilename(), /^midia-/);
    await page.getByRole("button", { name: "Fechar visualização" }).click();
    await page.getByRole("button", { name: "Carregar mais", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Imagem de/ })).toHaveCount(13);
    await page.getByRole("button", { name: "Selecionar itens" }).click();
    await page.getByRole("button", { name: /^Imagem de/ }).first().click();
    await expect(page.getByText("1 selecionado", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Documentos", exact: true }).click();
    await expect(page.getByText("manual.pdf", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Links", exact: true }).click();
    await expect(page.getByRole("link", { name: "https://example.com/manual" })).toHaveAttribute("rel", "noopener noreferrer");
    await page.getByRole("button", { name: "Pesquisar na biblioteca" }).click();
    await page.getByRole("searchbox").fill("inexistente");
    await expect(page.getByText("Nenhum link encontrado", { exact: true })).toBeVisible();
    await page.getByRole("searchbox").fill("");
    await expect(page.getByRole("link", { name: "https://example.com/manual" })).toBeVisible();
    await page.getByRole("button", { name: "Ordenar dos mais antigos para os mais recentes" }).click();
    await expect.poll(() => requests.some((query) => query.includes("sort=oldest"))).toBe(true);
    await page.getByRole("tab", { name: "Mídias", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Imagem de/ })).toHaveCount(12);
    await page.waitForFunction(() => [...document.querySelectorAll('[role="tabpanel"] img')].slice(0, 5).every((image) => image.complete && image.naturalWidth > 0));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-media-library-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = page.getByRole("dialog", { name: "Mídia", exact: true });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-media-library-mobile.png") });
    await page.getByRole("button", { name: "Fechar biblioteca" }).click();
    await expect(dialog).toHaveCount(0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
