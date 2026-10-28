import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("message menu edits sent text, preserves signatures, handles failure and cancellation", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "edit-message.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React, {useState} from "react";
      import {createRoot} from "react-dom/client";
      import {MessageBubble} from "@/components/chat/message-bubble";
      import {editMessage} from "@/lib/chat-api";
      const noop = async () => {};
      const initial = {id:1,content:"*Kaio:* O ifoof",type:"TEXT",direction:"OUTGOING",contactId:1,createdAt:new Date().toISOString(),readAt:null,reaction:null};
      function App() {
        const [message,setMessage] = useState(initial);
        return <main style={{padding:24,display:"flex",flexDirection:"column",gap:24}}>
          {[message,{...initial,id:2,direction:"INCOMING"},{...initial,id:3,createdAt:new Date(Date.now()-16*60_000).toISOString()},{...initial,id:4,deletedAt:new Date().toISOString()},{...initial,id:5,private:true}].map(item => <article key={item.id} id={'message-'+item.id}>
            <MessageBubble message={item} contact={{id:1,name:"Contato",phone:"123"}} mediaMessages={[]} savedContacts={[]} onReact={noop} onUpdateFlags={noop} onDelete={noop} onEdit={async(id,text)=>{const result=await editMessage(id,text);setMessage(current=>({...current,...result}));}} onRequestForward={noop} onReply={noop} onNavigateToMessage={noop} onSaveSharedContact={noop} onMessageSharedContact={noop}/>
          </article>)}
        </main>;
      }
      createRoot(document.getElementById("root")).render(<App/>);
    ` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, reducedMotion: "reduce" });
    const requests = [], errors = [];
    let fail = true;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://edit.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/messages/1") {
        assert.equal(route.request().method(), "PATCH");
        const body = route.request().postDataJSON();
        requests.push(body);
        return route.fulfill(fail ? { status: 502, json: { message: "Falha no WhatsApp. Tente novamente." } } : { json: { content: body.text, editedAt: new Date().toISOString() } });
      }
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://edit.test/");
    await page.addStyleTag({ content: css.css });
    for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
    const openMenu = async id => page.locator(`#message-${id}`).getByRole("button", { name: "Ações da mensagem", exact: true }).click({ force: true });
    for (const id of [2, 3, 4, 5]) {
      await openMenu(id);
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Editar", exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    await openMenu(1);
    await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Editar mensagem", exact: true });
    const input = dialog.getByRole("textbox", { name: "Texto da mensagem" });
    await expect(input).toHaveValue("O ifoof");
    await expect(dialog.getByRole("button", { name: "Salvar edição" })).toBeDisabled();
    await input.fill(" ");
    await expect(dialog.getByRole("button", { name: "Salvar edição" })).toBeDisabled();
    await input.fill("Texto corrigido");
    await dialog.getByRole("button", { name: "Salvar edição" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Falha no WhatsApp");
    await expect(input).toHaveValue("Texto corrigido");
    await expect(page.locator("#message-1")).toContainText("O ifoof");
    fail = false;
    await input.press("Enter");
    await expect(dialog).toHaveCount(0);
    assert.deepEqual(requests, [{ text: "*Kaio:* Texto corrigido" }, { text: "*Kaio:* Texto corrigido" }]);
    await expect(page.locator("#message-1")).toContainText("Texto corrigido");
    await expect(page.locator("#message-1")).toContainText("editada");
    await page.setViewportSize({ width: 390, height: 844 });
    await openMenu(1);
    await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
    await input.fill("Cancelar alteração");
    await expect(dialog).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await dialog.getByRole("button", { name: "Cancelar edição" }).click();
    await expect(dialog).toHaveCount(0);
    assert.equal(requests.length, 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
