import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("message menu translates into Portuguese, preserves original, caches hidden results and retries failures", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React,{useState} from "react";import{createRoot}from"react-dom/client";
      import{MessageBubble}from"@/components/chat/message-bubble";
      const contact={id:1,name:"John",phone:"123",isGroup:false};const noop=async()=>{};
      function App(){const [content,setContent]=useState("Hello, how are you?");window.editMessage=()=>setContent("Good morning!");
        return <main style={{padding:24,display:"flex",flexDirection:"column",gap:36}}>
          {[{id:1,content,direction:"INCOMING"},{id:2,content:"*Agent:* See you tomorrow!",direction:"OUTGOING",private:true},{id:3,content:"*Agent:* Thanks!",direction:"OUTGOING"},{id:4,content:"Deleted",direction:"INCOMING",deletedAt:"2026-10-20T15:00:00Z"}].map(item=><article data-testid={"message-"+item.id} key={item.id} style={{display:"flex",justifyContent:item.direction==="OUTGOING"?"flex-end":"flex-start"}}>
          <MessageBubble message={{type:"TEXT",contactId:1,createdAt:"2026-10-20T15:00:00Z",readAt:null,reaction:null,...item}} contact={contact} mediaMessages={[]} savedContacts={[]} onReact={noop} onUpdateFlags={noop} onDelete={noop} onRequestForward={noop} onReply={noop} onNavigateToMessage={noop} onSaveSharedContact={noop} onMessageSharedContact={noop}/></article>)}
        </main>};createRoot(document.getElementById("root")).render(<App/>);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, reducedMotion: "reduce" });
    const errors = [], requests = [];
    let fail = true;
    let release;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://translation.test/**", async route => {
      if (new URL(route.request().url()).pathname === "/api/ai/translate") {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (body.text === "Hello, how are you?") {
          await new Promise(resolve => { release = resolve; });
          return route.fulfill({ json: { text: "Olá, como você está?" } });
        }
        if (body.text === "*Agent:* See you tomorrow!" && fail) return route.fulfill({ status: 502, json: { error: "Tradução indisponível. Tente novamente." } });
        return route.fulfill({ json: { text: body.text === "Thanks!" ? "Obrigado!" : body.text === "Good morning!" ? "Bom dia!" : "Até amanhã!" } });
      }
      if (route.request().url().includes("/api/")) throw new Error("Unexpected mutation: " + route.request().url());
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://translation.test/");
    await page.addStyleTag({ content: css.css });
    await page.addStyleTag({ content: "body{background:#09090b;color:white;font-family:Arial}" });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const screenshotDirectory = process.env.TRANSLATION_SCREENSHOT_DIR;
    if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
    const message = id => page.getByTestId(`message-${id}`);
    const menu = async id => { await message(id).hover(); await message(id).getByRole("button", { name: "Ações da mensagem", exact: true }).click(); };
    await menu(1);
    if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, "translation-menu.png") });
    await message(1).getByRole("menuitem", { name: "Traduzir para português" }).click();
    await expect(message(1).getByRole("status")).toHaveText("Traduzindo…");
    await expect.poll(() => Boolean(release)).toBe(true);
    release();
    await expect(message(1).getByText("Olá, como você está?", { exact: true })).toBeVisible();
    await expect(message(1).getByText("Hello, how are you?", { exact: true })).toBeVisible();
    await message(1).getByRole("button", { name: "Ocultar tradução" }).click();
    await expect(message(1).getByText("Olá, como você está?", { exact: true })).toHaveCount(0);
    await menu(1);
    await message(1).getByRole("menuitem", { name: "Traduzir para português" }).click();
    await expect(message(1).getByText("Olá, como você está?", { exact: true })).toBeVisible();
    assert.equal(requests.length, 1);
    await menu(2);
    await message(2).getByRole("menuitem", { name: "Traduzir para português" }).click();
    await expect(message(2).getByRole("alert")).toContainText("Tradução indisponível");
    fail = false;
    await message(2).getByRole("button", { name: "Tentar novamente" }).click();
    await expect(message(2).getByText("Até amanhã!", { exact: true })).toBeVisible();
    await menu(3);
    await message(3).getByRole("menuitem", { name: "Traduzir para português" }).click();
    await expect(message(3).getByText("Obrigado!", { exact: true })).toBeVisible();
    assert.equal(requests.at(-1).text, "Thanks!");
    await menu(4);
    await expect(message(4).getByRole("menuitem", { name: "Traduzir para português" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.editMessage());
    await expect(message(1).getByRole("region", { name: "Tradução para português" })).toHaveCount(0);
    await menu(1);
    await message(1).getByRole("menuitem", { name: "Traduzir para português" }).click();
    await expect(message(1).getByText("Bom dia!", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(message(1).getByText("Bom dia!", { exact: true })).toBeVisible();
    if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, "translation-mobile.png"), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
