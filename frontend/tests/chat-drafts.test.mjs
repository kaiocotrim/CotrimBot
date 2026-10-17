import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("conversation drafts stay with their contact, show in the sidebar and survive sending or forwarding in other chats", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const message = (id, contactId, content = "Última mensagem") => ({ id, contactId, content, externalId: `message-${id}`, direction: "OUTGOING", type: "TEXT", createdAt: "2026-10-16T21:00:00Z", readAt: null, reaction: null });
  const contacts = [1, 2].map(id => ({ id, name: id === 1 ? "Ana" : "Bruno", phone: `551199999999${id}`, isGroup: false, isSaved: true, archived: false, unreadCount: 0, messages: [message(id, id)] }));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "drafts.js", alias: { react: path.dirname(require.resolve("react/package.json")) },
    plugins: [{ name: "local-services", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(socket|auth-client)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: modulePath }) => ({ contents: modulePath.endsWith("/socket") ? `export const socket={on(){},off(){},connect(){},disconnect(){},emit(){}};` : `export const useSession=()=>({data:{user:{id:"me",name:"Teste"},session:{}}}); export const authClient={organization:{list:async()=>({data:[]})}};` }));
    } }],
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react";import{createRoot}from"react-dom/client";
      import{useChat}from"@/hooks/use-chat";import{MessageComposer}from"@/components/chat/message-composer";import{ContactSidebar}from"@/components/chat/contact-sidebar";
      function App(){const chat=useChat();window.chat=chat;const noop=()=>{};return <main style={{position:"relative",height:"100dvh",display:"flex"}}>
      <ContactSidebar userId="me" contacts={chat.contacts} drafts={chat.drafts} loading={chat.loadingContacts} error={null} selectedContactId={chat.selectedContact?.id} onSelectContact={chat.selectContact} onLoadSavedContacts={chat.loadSavedContacts} onSaveContact={chat.saveContact} onArchiveContact={chat.archiveContact} onPinContact={chat.pinContact} mobileOpen={true} revealForSwipe={false} onMobileOpenChange={noop} notifications={[]} notificationUnreadCount={0} notificationPermission="unsupported" onRequestNotificationPermission={noop} onOpenNotification={noop} onMarkAllNotificationsRead={noop} onClearNotifications={noop}/>
      {chat.selectedContact&&<section style={{position:"relative",flex:1}}><MessageComposer userId="me" dropZoneContainer={null} text={chat.text} sending={chat.sending} closing={false} onTextChange={chat.setText} onSend={chat.sendMessage} onCloseWithBot={noop} onSendMedia={chat.sendMediaMessage} focusRequestKey={chat.selectedContact.id+":0"} replyingTo={null} onCancelReply={noop}/></section>}</main>};createRoot(document.getElementById("root")).render(<App/>);` },
    bundle: true, write: false, jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
    const errors = [], sent = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://drafts.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/contacts") return route.fulfill({ json: contacts });
      if (url.pathname.endsWith("/avatar")) return route.fulfill({ json: { profilePictureUrl: null } });
      if (url.pathname.endsWith("/messages")) return route.fulfill({ json: { messages: [], hasMore: false } });
      if (url.pathname.endsWith("/send")) { const body = route.request().postDataJSON(); sent.push({ ...body, contactId: Number(url.pathname.split("/")[3]) }); return route.fulfill({ json: { message: message(100 + sent.length, sent.at(-1).contactId, body.text) } }); }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://drafts.test/");
    await page.addStyleTag({ content: css.css });
    for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
    await expect.poll(() => page.evaluate(() => window.chat?.contacts.length)).toBe(2);
    const input = page.getByRole("textbox", { name: "Mensagem", exact: true });
    const select = async id => { await page.evaluate(id => window.chat.selectContact(window.chat.contacts.find(c => c.id === id)), id); await expect(input).toBeFocused(); };
    await select(1);await input.fill("Rascunho da Ana");
    await select(2);await expect(input).toHaveValue("");await input.fill("Rascunho do Bruno");
    await expect(page.getByText("Rascunho:", { exact: true })).toHaveCount(2);
    await select(1);await expect(input).toHaveValue("Rascunho da Ana");
    await page.evaluate(() => window.chat.selectContact(null));await select(2);await expect(input).toHaveValue("Rascunho do Bruno");
    await select(1);await input.fill("");await expect(page.getByText("Rascunho:", { exact: true })).toHaveCount(1);
    await input.fill("Mensagem enviada");await input.press("Enter");await expect(input).toHaveValue("");
    await expect.poll(() => sent.length).toBe(1);assert.equal(sent[0].contactId, 1);
    await select(2);await expect(input).toHaveValue("Rascunho do Bruno");
    await select(1);await input.fill("Outro rascunho da Ana");
    await page.evaluate(source => window.chat.forwardMessage(source, window.chat.contacts.find(c => c.id === 2)), message(50, 1, "Encaminhada"));
    await expect(input).toHaveValue("Rascunho do Bruno");await expect(input).toBeFocused();
    await select(1);await expect(input).toHaveValue("Outro rascunho da Ana");
    await expect(page.getByText("Rascunho:", { exact: true })).toHaveCount(2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
