import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

test("avatars renew expired links, retry temporary failures and limit unavailable photos", async () => {
  const require = createRequire(import.meta.url);
  const bundle = await build({
    absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
    tsconfigRaw: {},
    alias: {
      "@": fileURLToPath(new URL("../", import.meta.url)),
      react: path.dirname(require.resolve("react/package.json")),
      "react-dom": path.dirname(require.resolve("react-dom/package.json")),
    },
    stdin: { resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "jsx", contents: `
      import React, {useState} from "react";
      import {createRoot} from "react-dom/client";
      import {Avatar} from "@/components/chat/avatar";
      import {useContactAvatars} from "@/hooks/use-contact-avatars";
      function App() {
        const [contacts, setContacts] = useState([
          {id: 1, name: "Expired", profilePictureUrl: "/expired.svg"},
          {id: 2, name: "Missing", profilePictureUrl: null},
          {id: 3, name: "Private", profilePictureUrl: "/private.svg"},
          {id: 4, name: "Same URL", profilePictureUrl: "/same.svg"},
        ]);
        const [selected, setSelected] = useState(contacts[0]);
        useContactAvatars(contacts, setContacts, setSelected);
        return <><div id="list">{contacts.map(contact => <div key={contact.id} id={'contact-' + contact.id}><Avatar contact={contact}/></div>)}</div>
          <div id="selected"><Avatar contact={selected}/></div></>;
      }
      createRoot(document.getElementById("root")).render(<App/>);
    ` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.clock.install();
    const requests = [];
    const errors = [];
    let missingAttempts = 0;
    let sameRenewed = false;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://avatars.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/contacts/")) {
        requests.push(url.pathname + url.search);
        if (url.pathname.includes("/2/")) {
          missingAttempts++;
          await route.fulfill(missingAttempts === 1 ? { status: 503, json: {} } : { json: { profilePictureUrl: "/fresh.svg" } });
        } else if (url.pathname.includes("/3/")) {
          await route.fulfill({ json: { profilePictureUrl: null } });
        } else {
          if (url.pathname.includes("/4/")) sameRenewed = true;
          await route.fulfill({ json: { profilePictureUrl: url.pathname.includes("/4/") ? "/same.svg" : "/fresh.svg" } });
        }
      } else if (url.pathname === "/fresh.svg" || (url.pathname === "/same.svg" && sameRenewed)) {
        await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>' });
      } else if (url.pathname.endsWith(".svg")) {
        await route.fulfill({ status: 403, body: "Unavailable" });
      } else {
        await route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
      }
    });
    await page.goto("http://avatars.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await expect(page.locator("#contact-1 img")).toHaveAttribute("src", "/fresh.svg");
    await expect(page.locator("#selected img")).toHaveAttribute("src", "/fresh.svg");
    await expect.poll(() => page.locator("#contact-4 img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect.poll(() => requests.length).toBe(4);
    assert.equal(requests.filter(url => url === "/api/contacts/1/avatar?refresh=1").length, 1);
    assert.equal(requests.filter(url => url === "/api/contacts/4/avatar?refresh=1").length, 1);
    await page.clock.fastForward(59_000);
    assert.equal(requests.length, 4);
    await page.clock.fastForward(1_000);
    await expect(page.locator("#contact-2 img")).toHaveAttribute("src", "/fresh.svg");
    await expect.poll(() => requests.filter(url => url.includes("/3/")).length).toBe(2);
    await expect(page.locator("#contact-3")).toHaveText("P");
    assert.equal(requests.filter(url => url.includes("/1/")).length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
