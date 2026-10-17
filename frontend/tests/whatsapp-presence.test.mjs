import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("WhatsApp presence shows typing or recording per contact, clears on pause/disconnect and expires after renewal", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const contacts = [1, 2].map(id => ({ id, name: id === 1 ? "Ana" : "Bruno", phone: `551199999999${id}`, isGroup: false, isSaved: true, archived: false, unreadCount: 0 }));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "presence.js", alias: { react: path.dirname(require.resolve("react/package.json")) },
    plugins: [{ name: "presence-socket", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/socket$/ }, () => ({ path: "socket", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `const handlers=new Map();export const socket={on(e,cb){if(!handlers.has(e))handlers.set(e,new Set());handlers.get(e).add(cb)},off(e,cb){handlers.get(e)?.delete(cb)},connect(){},disconnect(){}};window.receive=(e,data)=>handlers.get(e)?.forEach(cb=>cb(data));window.listenerCount=()=>handlers.get("contact_presence")?.size??0;` }));
    } }],
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react";import{createRoot}from"react-dom/client";import{useChat}from"@/hooks/use-chat";import{ChatHeader}from"@/components/chat/chat-header";import{MessageComposer}from"@/components/chat/message-composer";
      function App(){const chat=useChat();window.chat=chat;const noop=()=>{};return chat.selectedContact?<><ChatHeader contact={chat.selectedContact} currentUserId="me" isTyping={chat.isTyping} contactPresence={chat.contactPresence} searchOpen={false} searchQuery="" currentResult={0} resultCount={0} selectionMode={false} selectedCount={0} selectionBusy={false} onSetContactAssignment={async()=>{}} onOpenSearch={noop} onOpenFavorites={noop} onStartSelection={noop} onCloseSelection={noop} onFavoriteSelected={noop} onDeleteSelected={noop} onOpenForward={noop} onOpenContactInfo={noop} onSearchQueryChange={noop} onPreviousResult={noop} onNextResult={noop} onCloseSearch={noop} onOpenSidebar={noop} sidebarOpen={false}/><MessageComposer userId="me" dropZoneContainer={null} text={chat.text} sending={false} closing={false} onTextChange={chat.setText} onSend={chat.sendMessage} onSendMedia={chat.sendMediaMessage} onCloseWithBot={noop} focusRequestKey={chat.selectedContact.id} replyingTo={null} onCancelReply={noop}/></>:null};const root=createRoot(document.getElementById("root"));root.render(<App/>);window.unmount=()=>root.unmount();` },
    bundle: true, write: false, jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    await page.route("http://presence.test/**", route => {
      const url = new URL(route.request().url());
      return route.fulfill(url.pathname === "/api/contacts" ? { json: contacts } : url.pathname.endsWith("/avatar") ? { json: { profilePictureUrl: null } } : url.pathname.endsWith("/messages") ? { json: { messages: [], hasMore: false } } : url.pathname.startsWith("/api/") ? { json: {} } : { contentType: "text/html", body: '<div id="root" style="position:relative;height:100dvh;background:#090909;color:white"></div>' });
    });
    await page.goto("http://presence.test/");await page.addStyleTag({ content: css.css });
    for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
    await expect.poll(() => page.evaluate(() => window.chat?.contacts.length)).toBe(2);
    const select = id => page.evaluate(id => window.chat.selectContact(window.chat.contacts.find(c => c.id === id)), id);
    const presence = data => page.evaluate(data => window.receive("contact_presence", data), data);
    const typing = page.getByRole("status", { name: "Ana está digitando", exact: true });
    const recording = page.getByRole("status", { name: "Ana está gravando áudio", exact: true });
    await select(1);
    await presence({ contactId: 1, presence: "composing", isTyping: true });await expect(typing).toHaveText("digitando...");
    await presence({ contactId: 1, presence: "recording", isTyping: false });await expect(recording).toHaveText("gravando áudio...");await expect(typing).toHaveCount(0);
    await presence({ contactId: 2, presence: "composing", isTyping: true });await expect(recording).toBeVisible();
    await select(2);await expect(page.getByRole("status", { name: "Bruno está digitando" })).toBeVisible();
    await select(1);await expect(recording).toBeVisible();
    await presence({ contactId: 1, presence: "paused", isTyping: true });await expect(recording).toHaveCount(0);await expect(typing).toHaveCount(0);
    for (const stopped of ["available", "unavailable"]) { await presence({ contactId: 1, presence: "composing" });await expect(typing).toBeVisible();await presence({ contactId: 1, presence: stopped });await expect(typing).toHaveCount(0); }
    await presence({ contactId: 1, presence: "recording" });await expect(recording).toBeVisible();await page.clock.fastForward(5000);
    await presence({ contactId: 1, presence: "recording" });await page.clock.fastForward(5000);await expect(recording).toBeVisible();await page.clock.fastForward(1001);await expect(recording).toHaveCount(0);
    await presence({ contactId: 1, isTyping: true });await expect(typing).toBeVisible();await page.clock.fastForward(6001);await expect(typing).toHaveCount(0);
    await presence({ contactId: 1, presence: "invalid", isTyping: true });await presence({ contactId: "1", presence: "recording" });await expect(typing).toHaveCount(0);await expect(recording).toHaveCount(0);
    const input = page.getByRole("textbox", { name: "Mensagem", exact: true });await input.fill("Olá");await expect(input).toHaveValue("Olá");await expect(page.getByRole("button", { name: "Abrir anexos", exact: true })).toBeVisible();await input.fill("");
    await presence({ contactId: 1, presence: "recording" });await expect(recording).toBeVisible();await page.evaluate(() => window.receive("disconnect"));await expect(recording).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.listenerCount()), 1);
    await page.evaluate(() => window.unmount());assert.equal(await page.evaluate(() => window.listenerCount()), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
