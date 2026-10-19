import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

test("local audio and model settings use loopback; server mode and failures remain usable", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react";
      window.React=React;
      import {createRoot} from "react-dom/client";
      import {AudioMessage} from "@/components/chat/audio-message";
      import * as local from "@/lib/local-transcription";
      import * as settings from "@/lib/transcription-settings";
      window.local=local; window.settings=settings; window.serverCalls=0;
      const root=createRoot(document.getElementById("root")); let key=0;
      window.resetAudio=()=>root.render(<AudioMessage key={key++} mediaUrl="/audio.ogg" messageId={1}
        onTranscribe={async()=>{window.serverCalls++; return "Transcrição do servidor";}}/>);
      window.resetAudio();
    ` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NEXT_PUBLIC_API_URL": '"/api"', "process.env.NODE_ENV": '"test"' },
  });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [], localRequests = [];
    let offline = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://127.0.0.1:8765/**", async route => {
      if (offline) return route.abort();
      const request = route.request();
      localRequests.push({ url: request.url(), method: request.method(), body: request.postData() });
      const pathname = new URL(request.url()).pathname;
      const json = pathname === "/" ? { status: "ok", service: "CotrimBot Transcription" }
        : pathname === "/transcribe" ? { text: "Transcrição feita no computador" }
        : { model: "base", beam_size: 1, vad_filter: true, language: "pt" };
      await route.fulfill({ json, headers: { "Access-Control-Allow-Origin": "*" } });
    });
    await page.route("http://127.0.0.1:3100/**", route => {
      if (route.request().url().endsWith("audio.ogg")) return route.fulfill({ contentType: "audio/ogg", body: "test audio bytes" });
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://127.0.0.1:3100/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForTimeout(200);
    assert.deepEqual(errors, []);
    const transcribe = page.getByRole("button", { name: "Transcrever áudio", exact: true });
    await transcribe.click();
    await expect(page.getByText("Transcrição do servidor", { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      window.local.setLocalTranscriptionEnabled(true);
      await window.local.checkLocalTranscription();
      const settings = await window.settings.getTranscriptionSettings();
      await window.settings.updateTranscriptionSettings({ ...settings, model: "tiny" });
      window.resetAudio();
    });
    await transcribe.click();
    await expect(page.getByText("Transcrição feita no computador", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.serverCalls), 1);
    const upload = localRequests.find(request => request.url.endsWith("/transcribe"));
    assert.match(upload.body, /test audio bytes/);
    assert(localRequests.some(request => request.method === "PUT" && request.body.includes('"model":"tiny"')));
    offline = true;
    await page.evaluate(() => window.resetAudio());
    await transcribe.click();
    await expect(page.getByText(/Não foi possível acessar o transcritor local/)).toBeVisible();
    assert.equal(await page.evaluate(() => window.serverCalls), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
