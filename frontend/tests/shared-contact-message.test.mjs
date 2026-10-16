import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

test("shared contact cards save once, show errors and allow retry", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const result = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { SharedContactMessage } from "@/components/chat/shared-contact-message";
      window.calls = [];
      window.fail = true;
      createRoot(document.getElementById("root")).render(<SharedContactMessage
        contacts={[{ name: "Kaio Cotrim", phone: "5511932075075" }, { name: "Bruno", phone: "5511999999999" }]}
        savedContacts={[{ name: "Bruno", phone: "5511999999999", isSaved: true }]}
        onSave={async (name, phone) => {
          window.calls.push({ name, phone });
          if (window.fail) throw new Error("Falha no salvamento");
        }}
      />);
    ` },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
  });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    assert.equal(await page.getByRole("button", { name: "Contato salvo", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Salvar contato", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.match(await page.getByRole("alert").innerText(), /Falha no salvamento/);
    await page.evaluate(() => { window.fail = false; });
    await page.getByRole("button", { name: "Salvar contato", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[role="alert"]') && document.querySelectorAll("button:disabled").length === 2);
    assert.deepEqual(await page.evaluate(() => window.calls), [
      { name: "Kaio Cotrim", phone: "5511932075075" },
      { name: "Kaio Cotrim", phone: "5511932075075" },
    ]);
    assert.equal(await page.getByRole("button", { name: "Salvar contato", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
