import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

test("internal typing is scoped, expires and stops without hiding other members", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const result = await build({
    absWorkingDir: frontend,
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: {
      resolveDir: frontend,
      loader: "jsx",
      contents: `
        import React, { useEffect } from "react";
        import { createRoot } from "react-dom/client";
        import { useInternalChat } from "@/hooks/use-internal-chat";
        import { TypingIndicator } from "@/components/chat/typing-indicator";
        function App() {
          const chat = useInternalChat({ activeOrganizationId: "org", currentUserId: "self" });
          useEffect(() => { window.chat = chat; });
          return chat.typingUserIds.length ? <TypingIndicator showLabel label={chat.typingUserIds.join(" e ") + " está digitando"} /> : null;
        }
        const root = createRoot(document.getElementById("root"));
        root.render(<App />);
        window.unmount = () => root.unmount();
      `,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{
      name: "local-chat-fixtures",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/(socket|auth-client|internal-chat-api)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: modulePath }) => ({ contents: modulePath.endsWith("/socket") ? `
          const handlers = new Map();
          export const socket = {
            connected: true,
            on(event, callback) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(callback); },
            off(event, callback) { handlers.get(event)?.delete(callback); },
            emit(event, payload) { window.emitted.push({ event, payload }); },
            connect() {},
          };
          window.emitted = [];
          window.receive = (event, payload) => handlers.get(event)?.forEach((callback) => callback(payload));
        ` : modulePath.endsWith("/auth-client") ? `export const authClient = {};` : `
          const bootstrap = { members: [], conversations: [], initialConversationId: "one", initialMessages: [], initialMessagesHasMore: false };
          export const getCachedInternalChatBootstrap = () => bootstrap;
          export const internalChatApi = { bootstrap: async () => bootstrap, messages: async () => ({ messages: [], hasMore: false }), read: async () => {} };
        ` }));
      },
    }],
  });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.waitForFunction(() => window.chat?.selectedId === "one", null, { timeout: 5_000 }).catch((error) => {
      throw new Error(`${error.message}\nBrowser errors: ${errors.join("; ")}`);
    });
    const event = (userId, conversationId = "one", organizationId = "org") => ({ userId, conversationId, organizationId });
    const receive = (name, payload) => page.evaluate(([name, payload]) => window.receive(name, payload), [name, payload]);
    const ids = () => page.evaluate(() => window.chat.typingUserIds);
    await receive("internal:typing:start", event("self"));
    await receive("internal:typing:start", event("Felype", "two"));
    await receive("internal:typing:start", event("Felype", "one", "elsewhere"));
    assert.deepEqual(await ids(), []);
    await receive("internal:typing:start", event("Felype"));
    await page.getByRole("status", { name: "Felype está digitando" }).waitFor();
    assert.match(await page.getByRole("status").innerText(), /Felype está digitando/);
    await receive("internal:typing:start", event("Bruno"));
    await page.waitForFunction(() => window.chat.typingUserIds.length === 2);
    await receive("internal:typing:stop", event("Bruno", "two"));
    assert.deepEqual(await ids(), ["Felype", "Bruno"]);
    await receive("internal:typing:stop", event("Felype"));
    await page.waitForFunction(() => window.chat.typingUserIds.length === 1);
    assert.deepEqual(await ids(), ["Bruno"]);
    await receive("internal:message:new", { organizationId: "org", conversationId: "one", message: { id: 1, senderId: "Bruno" } });
    await page.waitForFunction(() => window.chat.typingUserIds.length === 0);
    await receive("internal:typing:start", event("Felype"));
    await page.clock.fastForward(3_600);
    await page.waitForFunction(() => window.chat.typingUserIds.length === 0);
    await receive("internal:typing:start", event("Felype"));
    await page.evaluate(() => window.chat.selectConversation("two"));
    await page.waitForFunction(() => window.chat.selectedId === "two" && !window.chat.typingUserIds.length);
    await page.evaluate(() => { for (let i = 0; i < 10; i++) window.chat.sendTyping(true); });
    assert.equal(await page.evaluate(() => window.emitted.filter((item) => item.event === "internal:typing:start").length), 1);
    await page.clock.fastForward(1_900);
    assert.equal(await page.evaluate(() => window.emitted.at(-1).event), "internal:typing:stop");
    await page.evaluate(() => window.chat.sendTyping(true));
    await page.evaluate(() => window.unmount());
    assert.equal(await page.evaluate(() => window.emitted.at(-1).event), "internal:typing:stop");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
