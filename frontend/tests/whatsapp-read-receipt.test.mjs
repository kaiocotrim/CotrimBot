import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

test("WhatsApp read events turn message checks white and update the conversation preview", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React,{useEffect}from"react";import{createRoot}from"react-dom/client";
      import{useChat}from"@/hooks/use-chat";import{MessageBubble}from"@/components/chat/message-bubble";
      const noop=async()=>{};
      function App(){const chat=useChat();useEffect(()=>{window.chat=chat;});return <main>{chat.messages.map(message=><article key={message.id} data-message={message.id}>
        <MessageBubble message={message} contact={chat.selectedContact} mediaMessages={[]} savedContacts={[]} onReact={noop} onUpdateFlags={noop} onDelete={noop} onRequestForward={noop} onReply={noop} onNavigateToMessage={noop} onSaveSharedContact={noop} onMessageSharedContact={noop}/>
      </article>)}</main>;}const root=createRoot(document.getElementById("root"));root.render(<App/>);window.unmount=()=>root.unmount();
    ` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "socket-fixture", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/socket$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        const handlers=new Map();export const socket={on(event,callback){if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event).add(callback)},off(event,callback){handlers.get(event)?.delete(callback)},emit(){},connect(){},disconnect(){}};
        window.receive=(event,payload)=>handlers.get(event)?.forEach(callback=>callback(payload));
        window.readListenerCount=()=>handlers.get("message_read")?.size??0;
      ` }));
    } }],
  });
  const message = { id: 7, externalId: "sent-id", contactId: 1, direction: "OUTGOING", type: "TEXT", content: "Olá", createdAt: "2026-10-21T11:52:00Z", readAt: null, reaction: null };
  const contact = { id: 1, name: "Cliente", phone: "5511999999999", isGroup: false, unreadCount: 0, messages: [message] };
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://read-receipt.test/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/contacts") return route.fulfill({ json: [contact] });
      if (url.pathname === "/api/contacts/1/avatar") return route.fulfill({ json: { profilePictureUrl: null } });
      if (url.pathname === "/api/contacts/1/messages") return route.fulfill({ json: { messages: [message], hasMore: false } });
      if (url.pathname.endsWith("/read") || url.pathname.endsWith("/presence-subscription")) return route.fulfill({ status: 204 });
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://read-receipt.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => window.chat?.contacts.length === 1);
    await page.evaluate(() => window.chat.selectContact(window.chat.contacts[0]));
    const receipt = page.locator('[data-message="7"] [aria-label="Mensagem enviada"]');
    await expect(receipt).toHaveClass(/text-white\/50/);
    await page.evaluate(() => window.receive("message_read", { messageId: 99, readAt: "2026-10-21T11:53:00Z" }));
    await expect(receipt).toBeVisible();
    await page.waitForTimeout(100);
    await page.evaluate(() => window.receive("message_read", { messageId: 7, readAt: "2026-10-21T11:53:00Z" }));
    await expect(page.locator('[data-message="7"] [aria-label="Mensagem visualizada"]')).toHaveClass(/\btext-white\b/);
    await expect.poll(() => page.evaluate(() => window.chat.contacts[0].messages[0].readAt)).toBe("2026-10-21T11:53:00Z");
    // Uma confirmação posterior deve atualizar o GIF existente, sem duplicar
    // o balão nem apagar a confirmação de leitura já recebida.
    await page.evaluate(({ message, contact }) => window.receive("new_message", { message: { ...message, type: "VIDEO", content: "[GIF]", gifPlayback: true }, contact }), { message, contact });
    const gif = page.locator('[data-message="7"] video[aria-label="Vídeo da mensagem"]');
    await expect(gif).toHaveAttribute("loop", "");
    await expect(gif).toHaveAttribute("autoplay", "");
    await expect(page.locator('[data-message="7"]')).toHaveCount(1);
    await expect(page.locator('[data-message="7"] [aria-label="Mensagem visualizada"]')).toBeVisible();
    await page.evaluate(({ message, contact }) => window.receive("new_message", { message: { ...message, type: "VIDEO", content: "[Vídeo]", gifPlayback: false }, contact }), { message, contact });
    await expect(gif).toHaveAttribute("loop", "");
    await expect(page.locator('[data-message="7"] [aria-label="Mensagem visualizada"]')).toBeVisible();
    await page.evaluate(() => window.unmount());
    assert.equal(await page.evaluate(() => window.readListenerCount()), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
