import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("teammates see a named typing badge above the composer only for the same contact, with stop, idle and reconnect cleanup", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const serverBundle = await build({ entryPoints: [path.join(frontend, "../backend/src/services/contact-typing.service.ts")], platform: "node", format: "esm", bundle: true, write: false });
  const { createContactTypingPresence } = await import("data:text/javascript;base64," + Buffer.from(serverBundle.outputFiles[0].text).toString("base64"));
  const http = createServer();
  const io = new Server(http, { cors: { origin: "*" } });
  const names = { alice: "Fernanda", bob: "Kaio", charlie: "Thiago" };
  const avatar = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="24" fill="#615380"/><circle cx="24" cy="18" r="8" fill="#e4c7ae"/><path d="M8 48v-8a16 16 0 0 1 32 0v8" fill="#a4b2c2"/></svg>').toString("base64");
  io.use((socket, next) => { socket.data.userId = socket.handshake.auth.userId; socket.data.userName = names[socket.data.userId]; socket.data.userImage = socket.data.userId === "alice" ? avatar : null; next(); });
  io.on("connection", createContactTypingPresence(io, async id => id === 1 || id === 2));
  await new Promise(resolve => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${http.address().port}`;
  let browser;
  try {
    const bundle = await build({
      absWorkingDir: frontend, outfile: "team-typing.js",
      alias: { react: path.dirname(require.resolve("react/package.json")) },
      plugins: [{ name: "socket-fixture", setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/socket$/ }, () => ({ path: "socket", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ resolveDir: frontend, contents: `import{io}from"socket.io-client";export const socket=io(${JSON.stringify(url)},{auth:{userId:window.TEST_USER},transports:["websocket"]});window.testSocket=socket;socket.on("connect_error",error=>{window.socketError=error.message+":"+String(error.description)});` }));
      } }],
      stdin: { resolveDir: frontend, loader: "jsx", contents: `
        import React,{useState}from"react";import{createRoot}from"react-dom/client";import{ChatPanel}from"@/components/chat/chat-panel";
        const noop=async()=>{};const contacts=[1,2].map(id=>({id,name:"Contato "+id,phone:"551199999999"+id,isGroup:false,isSaved:true,unreadCount:0}));
        function App(){const[id,setId]=useState(window.TEST_USER==="charlie"?2:1);const[text,setText]=useState("");return <main style={{height:"100dvh",display:"flex",flexDirection:"column"}}><nav><button onClick={()=>{setId(id===1?2:1);setText("")}}>Trocar contato</button></nav><div style={{position:"relative",display:"flex",flex:1,minHeight:0}}><ChatPanel userId={window.TEST_USER} currentUser={{id:window.TEST_USER,name:"Membro"}} contact={contacts[id-1]} contacts={contacts} messages={[]} text={text} sending={false} closing={false} hasOlderMessages={false} loadingOlderMessages={false} newMessageId={null} isTyping={false} onTextChange={setText} onSend={()=>setText("")} onLoadOlderMessages={noop} onEnsureMessageLoaded={noop} onReactToMessage={noop} onUpdateMessageFlags={noop} onDeleteMessage={noop} onForwardMessage={noop} onSendMedia={noop} onCloseWithBot={noop} onSendPoll={noop} onSelectContact={noop} onSaveContact={noop} onSaveSharedContact={noop} onMessageSharedContact={noop} onRenameContact={noop} onSetContactAssignment={noop} onSetContactPriority={noop} onOpenSidebar={noop} sidebarOpen={false}/></div></main>};createRoot(document.getElementById("root")).render(<App/>);` },
      bundle: true, write: false, jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    });
    const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
    const errors = [];
    async function open(user) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" });
      await page.context().grantPermissions(["local-network-access"], { origin: "http://127.0.0.1:3102" });
      page.on("pageerror", error => errors.push(error.message));
      await page.route("http://127.0.0.1:3102/**", route => route.fulfill({ contentType: "text/html", body: `<script>window.TEST_USER=${JSON.stringify(user)}</script><div id="root"></div>` }));
      await page.goto("http://127.0.0.1:3102/");
      await page.addStyleTag({ content: css.css + "\nbody{margin:0;background:#09090b;color:white;font-family:Arial}" });
      for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
      await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
      await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.testSocket.connected || window.socketError)).toBe(true);
      return page;
    }
    const alice = await open("alice"), bob = await open("bob"), charlie = await open("charlie");
    const input = page => page.getByRole("textbox", { name: "Mensagem", exact: true });
    const badge = page => page.getByRole("status", { name: /está digitando|estão digitando/ });
    await input(alice).fill("Olá");
    await expect(badge(bob)).toHaveAccessibleName("Fernanda está digitando…");
    await expect(badge(bob)).toContainText("Fernanda");
    await expect(badge(bob).locator("[data-team-typing-avatar] img")).toHaveAttribute("src", avatar);
    await expect(badge(bob).locator("[data-typing-dot]")).toHaveCount(3);
    await expect(badge(alice)).toHaveCount(0);
    await expect(badge(charlie)).toHaveCount(0);
    const badgeBox = await badge(bob).boundingBox(), inputBox = await input(bob).boundingBox();
    assert(badgeBox.y + badgeBox.height <= inputBox.y);
    await input(alice).press("Enter");
    await expect(badge(bob)).toHaveCount(0);
    await input(alice).fill("Outra mensagem");
    await expect(badge(bob)).toBeVisible();
    await alice.getByRole("button", { name: "Trocar contato" }).click();
    await expect(badge(bob)).toHaveCount(0);
    await alice.getByRole("button", { name: "Trocar contato" }).click();
    await charlie.getByRole("button", { name: "Trocar contato" }).click();
    await input(alice).fill("Mensagem em preparação");
    await input(charlie).fill("Também estou digitando");
    await expect(badge(bob)).toHaveAccessibleName(/estão digitando/);
    await expect(badge(bob).locator("[data-team-typing-avatar]")).toHaveCount(2);
    await expect(badge(bob).locator("[data-team-typing-avatar]").nth(1)).toContainText("T");
    if (process.env.TEAM_TYPING_SCREENSHOT_DIR) {
      await mkdir(process.env.TEAM_TYPING_SCREENSHOT_DIR, { recursive: true });
      await bob.setViewportSize({ width: 390, height: 844 });
      await bob.screenshot({ path: path.join(process.env.TEAM_TYPING_SCREENSHOT_DIR, "team-typing.png") });
    }
    await expect(badge(bob)).toHaveCount(0, { timeout: 5000 });
    await input(alice).fill("Retomando");
    await expect(badge(bob)).toHaveAccessibleName("Fernanda está digitando…");
    await alice.evaluate(() => window.testSocket.disconnect());
    await expect(badge(bob)).toHaveCount(0);
    await alice.evaluate(() => window.testSocket.connect());
    await expect.poll(() => alice.evaluate(() => window.testSocket.connected)).toBe(true);
    await input(alice).fill("Reconectada");
    await expect(badge(bob)).toHaveAccessibleName("Fernanda está digitando…");
    await alice.close();
    await expect(badge(bob)).toHaveCount(0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => io.close(() => resolve()));
  }
});
