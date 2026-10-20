import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("sidebar shows team typing in other contacts, restores drafts and messages, filters self and recovers active typing on reconnect", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const serverBundle = await build({ entryPoints: [path.join(frontend, "../backend/src/services/contact-typing.service.ts")], platform: "node", format: "esm", bundle: true, write: false });
  const { createContactTypingPresence } = await import("data:text/javascript;base64," + Buffer.from(serverBundle.outputFiles[0].text).toString("base64"));
  const http = createServer();
  const io = new Server(http, { cors: { origin: "*" } });
  io.use((socket, next) => { socket.data.userId = socket.handshake.auth.userId; socket.data.userName = socket.data.userId === "thiago" ? "Thiago" : "Observador"; next(); });
  io.on("connection", createContactTypingPresence(io, async id => id === 1 || id === 2));
  await new Promise(resolve => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${http.address().port}`;
  let browser, heartbeat;
  const actors = [];
  try {
    const bundle = await build({
      absWorkingDir: frontend, outfile: "sidebar-typing.js", alias: { react: path.dirname(require.resolve("react/package.json")) },
      plugins: [{ name: "test-services", setup(builder) {
        const modules = {
          "@/lib/socket": `import{io}from"socket.io-client";export const socket=io(${JSON.stringify(url)},{auth:{userId:"viewer"},transports:["websocket"]});window.testSocket=socket;`,
          "@/lib/auth-client": 'export const useSession=()=>({data:{user:{id:"viewer",name:"Observador"},session:{}}});export const authClient={organization:{list:async()=>({data:[]})}};',
          "@/components/chat/chat-navigation-rail": 'export const ChatNavigationRail=()=>null;',
        };
        builder.onResolve({ filter: /^@\/(lib\/(socket|auth-client)|components\/chat\/chat-navigation-rail)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ resolveDir: frontend, contents: modules[path] }));
      } }],
      stdin: { resolveDir: frontend, loader: "jsx", contents: `
        import React from"react";import{createRoot}from"react-dom/client";import{ContactSidebar}from"@/components/chat/contact-sidebar";
        const noop=async()=>{};const contacts=[1,2].map(id=>({id,name:"Contato "+id,phone:"551199999999"+id,isGroup:false,isSaved:true,unreadCount:0,messages:[{id,content:"Última mensagem "+id,type:"TEXT",direction:"INCOMING",createdAt:"2026-10-20T12:00:00Z"}]}));
        createRoot(document.getElementById("root")).render(<main style={{display:"flex",height:"100dvh"}}><ContactSidebar userId="viewer" contacts={contacts} drafts={{1:"Texto salvo"}} loading={false} error={null} selectedContactId={2} onSelectContact={noop} onLoadSavedContacts={async()=>contacts} onSaveContact={noop} onArchiveContact={noop} onPinContact={noop} mobileOpen={true} revealForSwipe={false} onMobileOpenChange={noop} notifications={[]} notificationUnreadCount={0} notificationPermission="unsupported" onRequestNotificationPermission={noop} onOpenNotification={noop} onMarkAllNotificationsRead={noop} onClearNotifications={noop}/></main>);` },
      bundle: true, write: false, jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    });
    const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, reducedMotion: "reduce" });
    await page.context().grantPermissions(["local-network-access"], { origin: "http://127.0.0.1:3103" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://127.0.0.1:3103/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("http://127.0.0.1:3103/");
    await page.addStyleTag({ content: css.css + "\nbody{margin:0;background:#09090b;color:white;font-family:Arial}" });
    for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
    const row = id => page.getByRole("button", { name: `Contato ${id}`, exact: true });
    await expect(row(1)).toContainText("Rascunho: Texto salvo");
    await expect(row(2)).toHaveAttribute("aria-current", "true");
    await expect.poll(() => page.evaluate(() => window.testSocket.connected)).toBe(true);
    async function actor(userId, contactId) {
      const socket = connect(url, { auth: { userId }, transports: ["websocket"], forceNew: true });
      actors.push(socket);
      await new Promise(resolve => socket.on("connect", resolve));
      assert.equal(await socket.timeout(2000).emitWithAck("contact:view", { contactId }), true);
      return socket;
    }
    const thiago = await actor("thiago", 1);
    let currentContact = 1;
    const refresh = () => thiago.emit("contact:typing:start", { contactId: currentContact });
    refresh(); heartbeat = setInterval(refresh, 1000);
    await expect(row(1).getByRole("status")).toHaveAccessibleName("Thiago digitando…");
    await expect(row(1)).not.toContainText("Texto salvo");
    await expect(row(2)).toContainText("Última mensagem 2");
    if (process.env.SIDEBAR_TYPING_SCREENSHOT_DIR) {
      await mkdir(process.env.SIDEBAR_TYPING_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SIDEBAR_TYPING_SCREENSHOT_DIR, "sidebar-typing.png"), clip: { x: 0, y: 0, width: 320, height: 500 } });
    }
    const ownTab = await actor("viewer", 2);
    ownTab.emit("contact:typing:start", { contactId: 2 });
    await expect(row(2).getByRole("status")).toHaveCount(0);
    currentContact = 2;
    assert.equal(await thiago.timeout(2000).emitWithAck("contact:view", { contactId: 2 }), true);
    refresh();
    await expect(row(1)).toContainText("Rascunho: Texto salvo");
    await expect(row(2).getByRole("status")).toHaveAccessibleName("Thiago digitando…");
    await page.evaluate(() => window.testSocket.disconnect());
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.evaluate(() => window.testSocket.connect());
    await expect(row(2).getByRole("status")).toHaveAccessibleName("Thiago digitando…");
    clearInterval(heartbeat);
    thiago.emit("contact:typing:stop", { contactId: 2 });
    await expect(row(2)).toContainText("Última mensagem 2");
    await expect(row(2).getByRole("status")).toHaveCount(0);
    assert.deepEqual(errors, []);
  } finally {
    clearInterval(heartbeat);
    actors.forEach(socket => socket.disconnect());
    await browser?.close();
    await new Promise(resolve => io.close(() => resolve()));
  }
});
