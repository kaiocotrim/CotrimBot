import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("polls vote, change and withdraw selections, show voters and receive live results", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#a1a1aa"/></svg>')}`;
  const initial = { question: "Qual horário?", options: ["Manhã", "Tarde"], selectableCount: 1, votes: [{ voterId: "ana@s.whatsapp.net", voterName: "Ana", voterProfilePictureUrl: picture, optionIndexes: [1], updatedAt: "2026-10-16T22:00:00Z" }] };
  const bundle = await build({
    absWorkingDir: frontend, outfile: "vote.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    plugins: [{ name: "poll-events", setup(build) {
      build.onResolve({ filter: /^@\/lib\/socket$/ }, () => ({ path: "socket", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `const listeners=new Set(); export const socket={on(event,cb){listeners.add(cb)},off(event,cb){listeners.delete(cb)}}; window.receivePoll=(poll)=>listeners.forEach(cb=>cb({messageId:7,poll})); window.listenerCount=()=>listeners.size;` }));
    } }],
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {PollMessage} from "@/components/chat/poll-message";
      const root=createRoot(document.getElementById("root"));let version=0;
      window.remount=()=>root.render(<PollMessage key={++version} messageId={7} poll={${JSON.stringify(initial)}}/>);window.remount();` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const errors = [], sent = [], avatarRequests = [];
    let poll = structuredClone(initial), fail = false, release;
    const delayed = new Promise((resolve) => { release = resolve; });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://vote.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/poll/voter-avatar")) {
        avatarRequests.push(url.searchParams.get("voterId"));
        await route.fulfill({ json: { profilePictureUrl: url.searchParams.get("voterId") === "bob@s.whatsapp.net" ? picture : null } });
      } else if (url.pathname.endsWith("/poll/vote")) {
        const { optionIndexes } = route.request().postDataJSON();sent.push(optionIndexes);
        if (sent.length === 1) await delayed;
        if (fail) { await route.fulfill({ status: 502, json: { message: "WhatsApp indisponível" } });return; }
        poll.votes = [...poll.votes.filter(vote => vote.voterId !== "own@s.whatsapp.net"), { voterId: "own@s.whatsapp.net", voterName: "Conta", optionIndexes, updatedAt: new Date().toISOString() }];
        await route.fulfill({ json: { poll, ownVoterIds: ["own@s.whatsapp.net"] } });
      } else if (url.pathname.endsWith("/poll")) await route.fulfill({ json: { poll, ownVoterIds: ["own@s.whatsapp.net"] } });
      else await route.fulfill({ contentType: "text/html", body: '<div id="root" style="width:288px;margin:40px auto;background:#27272a;border-radius:24px;padding:16px"></div>' });
    });
    await page.goto("http://vote.test/");
    await page.addStyleTag({ content: css.css + "body{margin:0;background:#090909;color:#eee}" });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const morning = page.getByRole("button", { name: "Votar em Manhã", exact: true });
    const afternoon = page.getByRole("button", { name: "Votar em Tarde", exact: true });
    await expect(page.getByText("1 participante", { exact: true })).toBeVisible();
    await expect(afternoon.getByRole("img", { name: "Foto de Ana", exact: true })).toBeVisible();
    await morning.click();
    await expect(morning).toBeDisabled();
    await expect(page.getByText("Enviando voto…", { exact: true })).toBeVisible();
    release();
    await expect(morning).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("2 participantes", { exact: true })).toBeVisible();
    await afternoon.click();
    await expect(afternoon).toHaveAttribute("aria-pressed", "true");
    await expect(morning).toHaveAttribute("aria-pressed", "false");
    assert.deepEqual(sent.at(-1), [1]);
    poll.votes.push({ voterId: "bob@s.whatsapp.net", voterName: "Bruno", optionIndexes: [0], updatedAt: new Date().toISOString() });
    await page.evaluate((poll) => window.receivePoll(poll), poll);
    await expect(page.getByText("3 participantes", { exact: true })).toBeVisible();
    await expect(morning.getByRole("img", { name: "Foto de Bruno", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ver votos", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Votos da enquete", exact: true });
    await expect(dialog.getByText("Ana", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Bruno", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Você", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Foto de Ana", exact: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Foto de Bruno", exact: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Você", exact: true })).toBeVisible();
    assert.equal(avatarRequests.filter(id => id === "bob@s.whatsapp.net").length, 1);
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-poll-voters.png") });
    await page.getByRole("button", { name: "Fechar votos" }).click();
    poll.selectableCount = 2;
    await page.evaluate((poll) => window.receivePoll(poll), poll);
    await morning.click();
    await expect(morning).toHaveAttribute("aria-pressed", "true");
    await expect(afternoon).toHaveAttribute("aria-pressed", "true");
    assert.deepEqual(sent.at(-1), [1, 0]);
    await afternoon.click();
    await expect(afternoon).toHaveAttribute("aria-pressed", "false");
    await morning.click();
    await expect(morning).toHaveAttribute("aria-pressed", "false");
    assert.deepEqual(sent.at(-1), []);
    fail = true;
    await morning.click();
    await expect(page.getByRole("alert")).toHaveText("WhatsApp indisponível");
    await expect(morning).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("2 participantes", { exact: true })).toBeVisible();
    fail = false;
    await morning.click();
    await expect(morning).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => window.remount());
    await expect(morning).toHaveAttribute("aria-pressed", "true");
    assert.equal(await page.evaluate(() => window.listenerCount()), 1);
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-poll-interactive.png") });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
