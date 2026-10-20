import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

test("internal read receipts update live, stay scoped and require every recipient in groups", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React,{useEffect}from"react";import{createRoot}from"react-dom/client";
      import{useInternalChat}from"@/hooks/use-internal-chat";
      import{InternalReadReceipt}from"@/components/chat/internal-read-receipt";
      function App(){const chat=useInternalChat({activeOrganizationId:"org",currentUserId:"self"});
        useEffect(()=>{window.chat=chat;});
        return <div>{chat.messages.map(message=><div key={message.id} data-receipt={message.id}><InternalReadReceipt message={message} participants={chat.selected?.participants??[]}/></div>)}</div>;
      }const root=createRoot(document.getElementById("root"));root.render(<App/>);window.unmount=()=>root.unmount();
    ` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "read-fixtures", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(socket|auth-client|internal-chat-api)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: modulePath }) => ({ contents: modulePath.endsWith("/socket") ? `
        const handlers=new Map();export const socket={connected:true,on(event,callback){if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event).add(callback)},off(event,callback){handlers.get(event)?.delete(callback)},emit(){},connect(){}};
        window.receive=(event,payload)=>handlers.get(event)?.forEach(callback=>callback(payload));
        window.listenerCount=()=>handlers.get("internal:conversation:read")?.size??0;
      ` : modulePath.endsWith("/auth-client") ? `export const authClient={};` : `
        const participant=(id,joinedAt="2026-10-20T14:00:00Z")=>({user:{id,name:id},joinedAt,lastReadAt:id==="self"?"2026-10-20T16:00:00Z":null,role:"MEMBER"});
        const conversations=[{id:"one",organizationId:"org",type:"DIRECT",participants:[participant("self"),participant("Felype")]},{id:"two",organizationId:"org",type:"GROUP",participants:[participant("self"),participant("Felype"),participant("Bruno"),participant("late","2026-10-20T15:10:00Z")]}];
        const messages=id=>[1,3].map((minute,index)=>({id:index+1,conversationId:id,senderId:"self",createdAt:"2026-10-20T15:0"+minute+":00Z",type:"TEXT",content:"Mensagem",reactions:[],sender:{id:"self",name:"Teste"}}));
        const bootstrap={conversations,members:[],initialConversationId:"one",initialMessages:messages("one"),initialMessagesHasMore:false};
        export const getCachedInternalChatBootstrap=()=>bootstrap;
        export const internalChatApi={bootstrap:async()=>bootstrap,messages:async(org,id)=>({messages:messages(id),hasMore:false}),read:async()=>({lastReadAt:"2026-10-20T16:00:00Z"})};
      ` }));
    } }],
  });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const receipt = id => page.locator(`[data-receipt="${id}"] > span`);
    const read = (userId, lastReadAt, conversationId = "one", organizationId = "org") => page.evaluate(payload => window.receive("internal:conversation:read", payload), { userId, lastReadAt, conversationId, organizationId });
    await expect(receipt(1)).toHaveAttribute("aria-label", "Mensagem enviada");
    await read("Felype", "2026-10-20T15:05:00Z", "one", "other-org");
    await read("self", "2026-10-20T16:00:00Z");
    await expect(receipt(1)).toHaveAttribute("aria-label", "Mensagem enviada");
    await read("Felype", "2026-10-20T15:02:00Z");
    await expect(receipt(1)).toHaveAttribute("aria-label", "Mensagem visualizada");
    await expect(receipt(1)).toHaveClass(/\btext-white\b/);
    await expect(receipt(2)).toHaveAttribute("aria-label", "Mensagem enviada");
    await read("Felype", "2026-10-20T14:59:00Z");
    await expect(receipt(1)).toHaveAttribute("aria-label", "Mensagem visualizada");
    await read("Felype", "2026-10-20T15:04:00Z");
    await expect(receipt(2)).toHaveAttribute("aria-label", "Mensagem visualizada");
    await page.evaluate(() => window.chat.selectConversation("two"));
    await page.waitForFunction(() => window.chat.selectedId === "two" && window.chat.messages.length === 2);
    await read("Felype", "2026-10-20T15:04:00Z");
    await expect(receipt(1)).toHaveAttribute("aria-label", "Mensagem enviada");
    await read("Felype", "2026-10-20T15:04:00Z", "two");
    await expect(receipt(1)).toHaveAttribute("aria-label", "Mensagem enviada");
    await read("Bruno", "2026-10-20T15:02:00Z", "two");
    await expect(receipt(1)).toHaveAttribute("aria-label", "Mensagem visualizada");
    await expect(receipt(2)).toHaveAttribute("aria-label", "Mensagem enviada");
    await read("Bruno", "2026-10-20T15:04:00Z", "two");
    await expect(receipt(2)).toHaveAttribute("aria-label", "Mensagem visualizada");
    await page.evaluate(() => window.unmount());
    assert.equal(await page.evaluate(() => window.listenerCount()), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
