import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const bundle = await build({
  absWorkingDir: frontend,
  stdin: { resolveDir: frontend, contents: `
    import React from "react";
    import {renderToStaticMarkup} from "react-dom/server";
    import {MessageText} from "./components/chat/message-text";
    export const render = (content, props = {}) => renderToStaticMarkup(React.createElement(MessageText, {content, ...props}));
  ` },
  bundle: true, write: false, platform: "node", format: "cjs",
  alias: { react: path.dirname(require.resolve("react/package.json")) },
  external: ["next/image"], jsx: "automatic",
});
const compiled = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, compiled, compiled.exports);
const { render } = compiled.exports;

test("renders all five native formats and combined styles", () => {
  assert.equal(render("*negrito* _itálico_ ~riscado~ ```mono``` `código`"),
    '<strong class="font-bold">negrito</strong> <em class="italic">itálico</em> <del class="line-through">riscado</del> <code class="font-mono whitespace-pre-wrap [overflow-wrap:anywhere]">mono</code> <code class="font-mono whitespace-pre-wrap [overflow-wrap:anywhere]">código</code>');
  assert.match(render("*_junto_*"), /<strong[^>]*><em[^>]*>junto<\/em><\/strong>/);
  assert.match(render("*a*"), /<strong[^>]*>a<\/strong>/);
});

test("code preserves markers, URLs, line breaks and escaped HTML literally", () => {
  const html = render("```*literal*\nhttps://example.com <script>``` `~literal~`");
  assert.ok(html.includes("*literal*\nhttps://example.com &lt;script&gt;"));
  assert.ok(html.includes(">~literal~</code>"));
  assert.doesNotMatch(html, /<strong|<del|<a |<script/);
});

test("keeps incomplete markers, identifiers and ordinary punctuation intact", () => {
  const content = "sem *fim e _fim\ncustomer_name_id 2*3*4 ~ aberto ** __ ~~";
  assert.equal(render(content), content);
});

test("retains links inside styles and does not format URL underscores", () => {
  const url = "https://example.com/a_b_c";
  const html = render(`*${url}* e ${url}.`);
  assert.match(html, /<strong[^>]*><a /);
  assert.equal((html.match(/href="https:\/\/example.com\/a_b_c"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<em/);
  assert.doesNotMatch(render(`*${url}*`, { linkify: false }), /<a /);
});
