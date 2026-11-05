import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { _electron, expect } from "@playwright/test";

const desktopPath = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const results = path.join(desktopPath, "test-results");

test("desktop opens the server sandboxed, blocks unsafe popups, and keeps login storage", { timeout: 90000 }, async () => {
  await mkdir(results, { recursive: true });
  const userData = await mkdtemp(path.join(results, "profile-"));
  const fixture = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><title>CotrimBot test</title><h1>Servidor de teste</h1>');
  });
  await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const serverUrl = `http://127.0.0.1:${fixture.address().port}/`;
  const env = { ...process.env, COTRIMBOT_DESKTOP_URL: serverUrl };
  delete env.ELECTRON_RUN_AS_NODE;
  let electron;
  try {
    electron = await _electron.launch({ args: [desktopPath, `--user-data-dir=${userData}`], env });
    let page = await electron.firstWindow();
    await expect(page.getByRole("heading", { name: "Servidor de teste" })).toBeVisible();
    const preferences = await electron.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const prefs = window.webContents.getLastWebPreferences();
      return { nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox, webSecurity: prefs.webSecurity };
    });
    assert.deepEqual(preferences, { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    await page.evaluate(() => {
      localStorage.setItem("desktop-persistence-test", "saved");
      window.open("javascript:document.body.innerHTML='unsafe'", "_blank");
      window.open("file:///C:/Windows/win.ini", "_blank");
    });
    assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    await expect(page.getByRole("heading", { name: "Servidor de teste" })).toBeVisible();
    await page.evaluate(() => window.open("/dashboard/", "_blank"));
    await expect(page).toHaveURL(`${serverUrl}dashboard/`);
    await electron.close();
    electron = await _electron.launch({ args: [desktopPath, `--user-data-dir=${userData}`], env });
    page = await electron.firstWindow();
    await expect(page.getByRole("heading", { name: "Servidor de teste" })).toBeVisible();
    assert.equal(await page.evaluate(() => localStorage.getItem("desktop-persistence-test")), "saved");
  } finally {
    if (electron) await electron.close();
    await new Promise(resolve => fixture.close(resolve));
  }
});

test("packaged executable opens the published CotrimBot login", { skip: !process.env.COTRIMBOT_SMOKE_EXECUTABLE, timeout: 90000 }, async () => {
  await mkdir(results, { recursive: true });
  const userData = await mkdtemp(path.join(results, "packaged-profile-"));
  await writeFile(path.join(userData, "server-url.json"), JSON.stringify({ serverUrl: "https://cotrim.infordoc.net/" }));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = await _electron.launch({ executablePath: process.env.COTRIMBOT_SMOKE_EXECUTABLE, args: [`--user-data-dir=${userData}`], env });
  try {
    const page = await electron.firstWindow();
    await page.waitForURL(url => url.origin === "https://cotrim.infordoc.net", { timeout: 60000 });
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: path.join(results, "published-login.png") });
  } finally { await electron.close(); }
});
