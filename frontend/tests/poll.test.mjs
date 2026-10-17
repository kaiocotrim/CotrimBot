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

test("poll attachment fits mobile, validates answers, retries failures and sends without submitting the text draft", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "poll.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React,{useState} from "react";
      import {createRoot} from "react-dom/client";
      import {MessageComposer} from "@/components/chat/message-composer";
      import {PollMessage} from "@/components/chat/poll-message";
      import {postPoll} from "@/lib/chat-api";
      window.textSends=0;
      function App(){
        const [text,setText]=useState("Rascunho da mensagem");
        const [polls,setPolls]=useState([]);
        return <><section aria-label="Enquetes enviadas">{polls.map((poll,index)=><PollMessage key={index} poll={poll}/>)}</section><MessageComposer
          userId="me" dropZoneContainer={null} text={text} sending={false} closing={false}
          onTextChange={setText} onSend={()=>window.textSends++} onCloseWithBot={()=>{}}
          focusRequestKey={0} replyingTo={null} onCancelReply={()=>{}} onSendMedia={async()=>{}}
          onSendPoll={async poll=>{const {message}=await postPoll(7,poll);setPolls(current=>[...current,message.poll]);}}
        /></>;
      }
      createRoot(document.getElementById("root")).render(<App/>);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    const errors = [], sent = [];
    let fail = true;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://poll.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/send-poll")) {
        const poll = route.request().postDataJSON();
        sent.push(poll);
        await route.fulfill(fail ? { status: 502, json: { message: "Falha de teste no envio" } } : { status: 201, json: { message: { id: 1, type: "POLL", poll } } });
      } else await route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://poll.test/");
    await page.addStyleTag({ content: css.css + "body{margin:0;background:#090909;color:#eee}" });
    for (const file of bundle.outputFiles.filter((file) => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text });
    const attachments = page.getByRole("button", { name: "Abrir anexos", exact: true });
    await attachments.click();
    await expect(page.getByRole("menuitem", { name: "Enquete", exact: true })).toBeVisible();
    await page.waitForTimeout(100);
    for (const item of await page.getByRole("menu").getByRole("menuitem").all()) {
      const rect = await item.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 320, JSON.stringify(rect));
    }
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-poll-menu-mobile.png") });
    await page.getByRole("menuitem", { name: "Enquete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Criar enquete", exact: true });
    const send = dialog.getByRole("button", { name: "Enviar enquete", exact: true });
    await expect(send).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Pergunta", exact: true }).fill(" Qual horário? ");
    await dialog.getByRole("textbox", { name: "Opção 1", exact: true }).fill("Manhã");
    await dialog.getByRole("textbox", { name: "Opção 2", exact: true }).fill("manhã");
    await expect(dialog.getByRole("alert")).toHaveText("Use opções de resposta diferentes.");
    await expect(send).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Opção 2", exact: true }).fill("Tarde");
    await dialog.getByRole("button", { name: "Adicionar opção" }).click();
    await dialog.getByRole("textbox", { name: "Opção 3", exact: true }).fill("Noite");
    await dialog.getByRole("checkbox", { name: "Permitir várias respostas" }).uncheck();
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-poll-form-mobile.png") });
    await send.click();
    await expect(dialog.getByRole("alert")).toHaveText("Falha de teste no envio");
    await expect(dialog.getByRole("textbox", { name: "Pergunta", exact: true })).toHaveValue(" Qual horário? ");
    assert.equal(await page.evaluate(() => window.textSends), 0);
    fail = false;
    await send.click();
    await expect(dialog).toHaveCount(0);
    assert.deepEqual(sent.at(-1), { question: "Qual horário?", options: ["Manhã", "Tarde", "Noite"], selectableCount: 1 });
    await expect(page.getByRole("region", { name: "Enquetes enviadas" })).toContainText("Qual horário?");
    await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toHaveValue("Rascunho da mensagem");
    assert.equal(await page.evaluate(() => window.textSends), 0);
    await page.setViewportSize({ width: 1280, height: 920 });
    await attachments.click();
    await page.getByRole("menuitem", { name: "Enquete", exact: true }).click();
    await dialog.getByRole("textbox", { name: "Pergunta", exact: true }).fill("Dias disponíveis?");
    await dialog.getByRole("textbox", { name: "Opção 1", exact: true }).fill("Segunda");
    await dialog.getByRole("textbox", { name: "Opção 2", exact: true }).fill("Terça");
    await expect(dialog.getByRole("checkbox", { name: "Permitir várias respostas" })).toBeChecked();
    await send.click();
    await expect(dialog).toHaveCount(0);
    assert.equal(sent.at(-1).selectableCount, 2);
    await attachments.click();
    await page.getByRole("menuitem", { name: "Enquete", exact: true }).click();
    for (let index = 2; index < 12; index++) await dialog.getByRole("button", { name: "Adicionar opção" }).click();
    await expect(dialog.getByRole("textbox")).toHaveCount(13);
    await expect(dialog.getByRole("button", { name: "Adicionar opção" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Remover opção 12", exact: true }).click();
    await expect(dialog.getByRole("textbox")).toHaveCount(12);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    assert.equal(sent.length, 3);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
