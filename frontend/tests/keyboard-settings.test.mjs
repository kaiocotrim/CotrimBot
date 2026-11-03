import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("keyboard preference applies immediately, persists per user, and preserves cursor and composition", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "keyboard.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React, {useState} from "react";
      import {createRoot} from "react-dom/client";
      import {KeyboardSettings} from "@/components/chat/keyboard-settings";
      import {MessageComposer} from "@/components/chat/message-composer";
      window.sent=[];
      function App(){
        const [user,setUser]=useState("ana"); const [text,setText]=useState("");
        const [mode,setMode]=useState("external"); window.setUser=setUser; window.setMode=setMode;
        return <main style={{padding:24}}>
          <KeyboardSettings key={user} userId={user}/>
          <div style={{position:"relative",marginTop:40}}>
            <MessageComposer userId={user} mode={mode} dropZoneContainer={null} text={text}
              sending={false} closing={false} onTextChange={setText}
              onSend={()=>{window.sent.push(text);setText("");}} onCloseWithBot={()=>{}}
              onSendMedia={async()=>{}} focusRequestKey={user} replyingTo={null} onCancelReply={()=>{}} />
          </div>
        </main>;
      }
      createRoot(document.getElementById("root")).render(<App/>);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://keyboard.test/**", route => route.fulfill({ contentType: "text/html", body: '<html><style>:root{--app-text:#eee;--app-muted:#aaa;--app-line:#444;--app-surface:#161616}body{background:#050505;color:#eee}</style><div id="root"></div></html>' }));
    const mount = async () => {
      await page.goto("http://keyboard.test/");
      await page.addStyleTag({ content: css.css });
      for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
      await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
    };
    await mount();
    const input = page.getByRole("textbox", { name: "Mensagem", exact: true });
    const shift = page.getByRole("radio", { name: "Shift + Enter", exact: true });
    const ctrl = page.getByRole("radio", { name: "Ctrl + Enter", exact: true });
    await expect(shift).toBeChecked();
    await input.fill("primeira"); await input.press("End"); await input.press("Shift+Enter");
    await expect(input).toHaveValue("primeira\n");
    await input.press("Enter");
    await expect.poll(() => page.evaluate(() => window.sent.length)).toBe(1);
    await ctrl.check();
    await input.fill("antes trecho depois");
    await input.evaluate(element => { element.focus(); element.setSelectionRange(6, 12); });
    await input.press("Control+Enter");
    await expect(input).toHaveValue("antes \n depois");
    await expect.poll(() => input.evaluate(element => element.selectionStart)).toBe(7);
    await input.press("Shift+Enter");
    await expect(input).toHaveValue("antes \n depois");
    await input.evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })));
    assert.equal(await page.evaluate(() => window.sent.length), 1);
    await input.press("Enter");
    await expect.poll(() => page.evaluate(() => window.sent.length)).toBe(2);
    await page.evaluate(() => window.setUser("bruno")); await expect(shift).toBeChecked();
    await page.evaluate(() => window.setUser("ana")); await expect(ctrl).toBeChecked();
    await mount(); await expect(ctrl).toBeChecked();
    await page.evaluate(() => window.setMode("internal"));
    await input.fill("interno"); await input.press("End"); await input.press("Control+Enter");
    await expect(input).toHaveValue("interno\n");
    await input.press("Enter");
    await expect.poll(() => page.evaluate(() => window.sent)).toEqual(["interno\n"]);
    // A change in another tab must reach the open settings and composer.
    await page.evaluate(() => {
      localStorage.setItem("cotrimbot:keyboard:newline:ana", "shift-enter");
      dispatchEvent(new StorageEvent("storage", { key: "cotrimbot:keyboard:newline:ana" }));
    });
    await expect(shift).toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.KEYBOARD_SCREENSHOT_PATH) await page.screenshot({ path: process.env.KEYBOARD_SCREENSHOT_PATH });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
