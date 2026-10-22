import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("audio files use the compact player while voice messages retain transcription", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react"; import {createRoot} from "react-dom/client";
      import {AudioMessage} from "@/components/chat/audio-message";
      createRoot(document.getElementById("root")).render(<main className="bg-zinc-950 p-6 text-white">
        {["file","voice"].map(variant=><section key={variant} data-testid={variant} className="relative mb-4 w-[min(330px,70vw)] rounded-[22px] bg-zinc-800 px-3.5 py-3">
          <AudioMessage mediaUrl="/sample.wav" messageId={1} variant={variant} />
          {variant==="file" && <span className="absolute right-[66px] bottom-2 text-[9px] text-white/55">11:03</span>}
        </section>)}
      </main>);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const wav = Buffer.alloc(44 + 8000 * 2 * 3);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("http://audio.test/**", route => route.request().url().endsWith("sample.wav")
      ? route.fulfill({ body: wav, contentType: "audio/wav" })
      : route.fulfill({ body: '<div id="root"></div>', contentType: "text/html" }));
    await page.goto("http://audio.test");
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const file = page.getByTestId("file");
    const voice = page.getByTestId("voice");
    await expect(page.locator("audio")).toHaveCount(2);
    await page.locator("audio").evaluateAll((elements, src) => elements.forEach(audio => { audio.src = src; }), `data:audio/wav;base64,${wav.toString("base64")}`);
    await expect(file.getByText("0:03", { exact: true })).toBeVisible();
    await expect(file.getByRole("button", { name: "Transcrever áudio" })).toHaveCount(0);
    await expect(voice.getByRole("button", { name: "Transcrever áudio" })).toBeVisible();
    await file.getByRole("button", { name: "Reproduzir áudio" }).click();
    await expect(file.getByRole("button", { name: "Pausar áudio" })).toBeVisible();
    await file.getByRole("button", { name: "Pausar áudio" }).click();
    await file.getByRole("slider").focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => file.locator("audio").evaluate(audio => audio.currentTime)).toBeGreaterThan(0);
    assert.ok((await file.boundingBox()).height < (await voice.boundingBox()).height);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (process.env.AUDIO_SCREENSHOT_PATH) await page.screenshot({ path: process.env.AUDIO_SCREENSHOT_PATH });
  } finally { await browser.close(); }
});
