import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("group mentions resolve LIDs and phone numbers in text, captions, replies and gallery without changing source or URLs", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const source = "@277815698174176 @83318892712062 Thiago abriu vagas p vcs 2 aí";
  const bundle = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React,{useState}from"react";import{createRoot}from"react-dom/client";
      import{MessageList}from"@/components/chat/message-list";import{ParticipantInfoPanel}from"@/components/chat/participant-info-panel";
      const noop=async()=>{};const source=${JSON.stringify(source)};
      const base={externalId:"x",contactId:1,type:"TEXT",direction:"INCOMING",createdAt:"2026-10-20T15:00:00Z",readAt:null,reaction:null,senderPhone:null,senderName:null};
      const messages=[{...base,id:1,content:source,senderPhone:"5511000000000",senderName:"Kaio Cotrim"},
        {...base,id:2,content:"Presente!",senderPhone:"5511999999999",senderName:"Thiago"},
        {...base,id:3,type:"IMAGE",content:source,senderPhone:"5511000000000",senderName:"Kaio Cotrim"},
        {...base,id:4,content:"Oi @5511888888888!",quotedContent:source,quotedSenderName:"Kaio",quotedMessageId:1},
        {...base,id:5,direction:"OUTGOING",private:true,content:"Nota: @83318892712062"},
        {...base,id:6,content:"https://example.com/@277815698174176 mail@277815698174176.com @999999999999",quotedContent:"https://example.com/@277815698174176",quotedMessageId:1}];
      window.rawMessages=messages;const saved={id:9,name:"Felype",phone:"5511888888888",isSaved:true,isGroup:false};
      function App(){const[group,setGroup]=useState(true);const[profile,setProfile]=useState(null);window.openDirect=()=>setGroup(false);return <main style={{height:"100dvh",display:"flex"}}><MessageList currentUser={{id:"me",name:"Teste"}} contact={{id:group?1:2,name:group?"Grupo":"Direto",phone:"group@g.us",isGroup:group}} contacts={[saved]} messages={messages} hasOlderMessages={false} loadingOlderMessages={false} newMessageId={null} hasPinnedMessage={false} selectionMode={false} selectedMessageIds={new Set()} onLoadOlderMessages={noop} onReactToMessage={noop} onUpdateMessageFlags={noop} onDeleteMessage={noop} onRequestForward={noop} onReplyToMessage={noop} onEnsureMessageLoaded={noop} onToggleMessageSelection={noop} onSaveSharedContact={noop} onMessageSharedContact={noop} onOpenParticipantInfo={setProfile}/>{profile&&<ParticipantInfoPanel profile={profile} groupName="Grupo" onClose={()=>setProfile(null)} onStartConversation={noop}/>}</main>};createRoot(document.getElementById("root")).render(<App/>);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1100 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://mentions.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/contacts/1/group-participants") return route.fulfill({ json: [
        { phone: "5511888888888", lid: "277815698174176", name: "Felype WhatsApp", isAdmin: false },
        { phone: "5511999999999", lid: "83318892712062", name: null, isAdmin: false },
      ] });
      if (url.pathname.endsWith("/sender-avatar")) return route.fulfill({ json: { profilePictureUrl: null } });
      if (url.pathname.endsWith("/media")) return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFioAAAAASUVORK5CYII=", "base64") });
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://mentions.test/");
    await page.addStyleTag({ content: css.css });
    await page.addStyleTag({ content: "body{background:#09090b;color:white;font-family:Arial}img{min-width:36px;min-height:36px}" });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const row = id => page.locator(`[data-message-id="${id}"]`);
    await row(2).getByRole("button", { name: "Ver informações de Thiago", exact: true }).click();
    const participantPanel = page.getByRole("complementary", { name: "Informações de Thiago" });
    await expect(participantPanel).toBeVisible();
    await expect(participantPanel).toContainText("+5511999999999");
    await expect(participantPanel).toContainText("Participante de Grupo");
    await page.keyboard.press("Escape");
    await expect(participantPanel).toHaveCount(0);
    await expect(row(2).getByRole("button", { name: "Ver informações de Thiago", exact: true })).toBeFocused();
    for (const id of [1, 3, 4]) {
      await expect(row(id).locator('[data-whatsapp-mention="277815698174176"]')).toHaveText("@Felype");
      await expect(row(id).locator('[data-whatsapp-mention="83318892712062"]')).toHaveText("@Thiago");
    }
    await expect(row(4).locator('[data-whatsapp-mention="5511888888888"]')).toHaveText("@Felype");
    await expect(row(5).locator('[data-whatsapp-mention]')).toHaveText("@Thiago");
    const privateColor = await row(5).locator('[data-whatsapp-mention]').evaluate(element => getComputedStyle(element).color);
    const regularColor = await row(1).locator('[data-whatsapp-mention]').first().evaluate(element => getComputedStyle(element).color);
    assert.notEqual(privateColor, regularColor);
    await expect(row(6).locator('[data-whatsapp-mention]')).toHaveCount(0);
    await expect(row(6).getByRole("link")).toHaveAttribute("href", "https://example.com/@277815698174176");
    await expect(row(6)).toContainText("mail@277815698174176.com @999999999999");
    await row(3).getByRole("button", { name: "Abrir imagem", exact: true }).click();
    await expect(page.getByRole("dialog").locator('[data-whatsapp-mention="277815698174176"]')).toHaveText("@Felype");
    await page.getByRole("button", { name: "Fechar visualizador" }).click();
    assert.equal(await page.evaluate(() => window.rawMessages[0].content), source);
    if (process.env.MENTION_SCREENSHOT_DIR) {
      await mkdir(process.env.MENTION_SCREENSHOT_DIR, { recursive: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await row(3).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.MENTION_SCREENSHOT_DIR, "group-mentions.png") });
    }
    await page.evaluate(() => window.openDirect());
    await expect(page.locator('[data-whatsapp-mention]')).toHaveCount(0);
    await expect(row(1)).toContainText(source);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
