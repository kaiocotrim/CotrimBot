import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

test("confetti loads local assets, draws and completes once", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const result = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { Confetti } from "@/components/chat/confetti";
      window.completed = 0;
      createRoot(document.getElementById("root")).render(<Confetti onComplete={() => window.completed++} />);
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
    await page.route("http://confetti.test/**", async (route) => {
      const filename = new URL(route.request().url()).pathname.split("/").at(-1);
      if (filename === "dotlottie-player.wasm" || filename === "Confetti-Animation.json") {
        await route.fulfill({ contentType: filename.endsWith(".wasm") ? "application/wasm" : "application/json", body: await readFile(path.join(frontend, "public/animations", filename)) });
      } else {
        await route.fulfill({ contentType: "text/html", body: '<style>html,body,#root,#root>div{width:600px;height:600px;margin:0}</style><div id="root"></div>' });
      }
    });
    await page.goto("http://confetti.test/");
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const context = canvas?.getContext("2d");
      if (!context) return false;
      return context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
    }, null, { timeout: 10_000 });
    await page.waitForFunction(() => window.completed === 1, null, { timeout: 10_000 });
    assert.equal(await page.evaluate(() => window.completed), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
