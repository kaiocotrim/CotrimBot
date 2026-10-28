import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

test("attached photos support shapes, drawing, crop, text, undo and edited-file sending", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "image-editor.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React,{useState} from "react"; import{createRoot}from"react-dom/client";
      import{MessageComposer}from"@/components/chat/message-composer";
      // Usa rasterização estável para as comparações de pixels entre prévia e exportação.
      const nativeContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,options){return nativeContext.call(this,kind,kind==="2d"?{...options,willReadFrequently:true}:options);};
      window.imageSignature=canvas=>{let hash=2166136261;for(const value of canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data)hash=Math.imul(hash^value,16777619);return canvas.width+"x"+canvas.height+":"+(hash>>>0);};
      function App(){const [text,setText]=useState("Legenda da foto"); const noop=async()=>{};
        return <main style={{height:"100dvh",position:"relative",background:"#09090b"}}><MessageComposer userId="test" dropZoneContainer={null}
          text={text} onTextChange={setText} sending={false} closing={false} focusRequestKey={1} replyingTo={null}
          onCancelReply={noop} onSend={noop} onCloseWithBot={noop} onSendMedia={async(files,caption)=>{
            window.sent=await Promise.all(files.map(async file=>{const bitmap=await createImageBitmap(file);const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext("2d").drawImage(bitmap,0,0);const info={name:file.name,type:file.type,width:bitmap.width,height:bitmap.height,size:file.size,pixels:window.imageSignature(canvas)};bitmap.close();return info;}));window.caption=caption;
          }}/></main>;
      } createRoot(document.getElementById("root")).render(<App/>);
    ` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://image-editor.test/**", route => route.fulfill(new URL(route.request().url()).pathname.startsWith("/api/") ? { json: [] } : { contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("http://image-editor.test/");
    await page.addStyleTag({ content: css.css });
    for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width=200; canvas.height=120;
      const ctx=canvas.getContext("2d");ctx.fillStyle="red";ctx.fillRect(0,0,100,120);ctx.fillStyle="blue";ctx.fillRect(100,0,100,120);
      return canvas.toDataURL().split(",")[1];
    }), "base64");
    await page.locator('input[type="file"]').setInputFiles([{name:"foto.png",mimeType:"image/png",buffer:png},{name:"outra.png",mimeType:"image/png",buffer:png}]);
    await expect(page.getByRole("button", { name: "Editar foto foto.png", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Editar foto foto.png", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Editar foto", exact: true });
    const canvas = dialog.locator("canvas");
    await expect(canvas).toBeVisible();
    const pixels = () => canvas.evaluate(c => window.imageSignature(c));
    const original = await pixels();
    const move = async (from, to) => {
      const box = await canvas.boundingBox();
      const dims = await canvas.evaluate(c => ({width:c.width,height:c.height}));
      await page.mouse.move(box.x+from.x*box.width/dims.width,box.y+from.y*box.height/dims.height);
      await page.mouse.down();
      await page.mouse.move(box.x+to.x*box.width/dims.width,box.y+to.y*box.height/dims.height,{steps:8});
      await page.mouse.up();
    };
    await dialog.getByRole("button",{name:"Desenhar",exact:true}).click();
    await move({x:20,y:30},{x:80,y:30});
    await expect.poll(() => pixels()).not.toBe(original);
    const drawn = await pixels();
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(original);
    await dialog.getByRole("button",{name:"Refazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(drawn);
    await dialog.getByRole("button",{name:"Recortar",exact:true}).click();
    await move({x:20,y:10},{x:180,y:110});
    await dialog.getByRole("button",{name:"Aplicar recorte",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => [c.width,c.height])).toEqual([160,100]);
    await dialog.getByRole("button",{name:"Girar foto",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => [c.width,c.height])).toEqual([100,160]);
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => [c.width,c.height])).toEqual([160,100]);
    const cropped = await pixels();
    await expect(dialog.getByRole("button",{name:"Emoji",exact:true})).toHaveCount(0);
    await dialog.getByRole("button",{name:"Formas",exact:true}).click();
    for (const shape of ["Seta", "Retângulo", "Triângulo", "Círculo", "Elipse", "Linha"]) {
      await dialog.getByRole("button",{name:shape,exact:true}).click();
      await move({x:20,y:20},{x:80,y:80});
      await expect.poll(() => pixels()).not.toBe(cropped);
      const shaped = await pixels();
      await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
      await expect.poll(() => pixels()).toBe(cropped);
      await dialog.getByRole("button",{name:"Refazer",exact:true}).click();
      await expect.poll(() => pixels()).toBe(shaped);
      await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
      await expect.poll(() => pixels()).toBe(cropped);
    }
    await dialog.getByRole("button",{name:"Seta",exact:true}).click();
    await move({x:10,y:90},{x:140,y:20});
    await dialog.getByRole("button",{name:"Retângulo",exact:true}).click();
    await dialog.getByRole("checkbox",{name:"Preencher forma",exact:true}).check();
    await move({x:10,y:10},{x:40,y:40});
    await expect.poll(() => canvas.evaluate(c => Array.from(c.getContext("2d").getImageData(25,25,1,1).data))).toEqual([255,255,255,255]);
    const stamped = await pixels();
    await dialog.getByRole("button",{name:"Texto",exact:true}).click();
    await dialog.getByRole("textbox",{name:"Texto na foto",exact:true}).fill("Oi");
    await move({x:120,y:55},{x:120,y:55});
    await expect.poll(() => pixels()).not.toBe(stamped);
    const firstText = await pixels();
    await dialog.getByRole("textbox",{name:"Texto na foto",exact:true}).fill("Olá");
    await dialog.getByRole("button",{name:"Itálico",exact:true}).click();
    await dialog.getByRole("button",{name:"Atualizar texto",exact:true}).click();
    await expect.poll(() => pixels()).not.toBe(firstText);
    const updatedText = await pixels();
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(firstText);
    await expect(dialog.getByRole("textbox",{name:"Texto na foto",exact:true})).toHaveValue("Oi");
    await dialog.getByRole("button",{name:"Refazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(updatedText);
    await expect(dialog.getByRole("textbox",{name:"Texto na foto",exact:true})).toHaveValue("Olá");
    const compare = dialog.getByRole("button",{name:"Comparar com original",exact:true});
    await compare.hover(); await page.mouse.down();
    await expect(compare).toHaveAttribute("aria-pressed","true");
    await expect.poll(() => pixels()).toBe(original);
    await page.mouse.up();
    await expect(compare).toHaveAttribute("aria-pressed","false");
    await expect.poll(() => pixels()).toBe(updatedText);
    await compare.focus(); await page.keyboard.down("Space");
    await expect.poll(() => pixels()).toBe(original);
    await page.keyboard.up("Space");
    await expect.poll(() => pixels()).toBe(updatedText);
    await dialog.getByRole("button",{name:"Ajustes",exact:true}).click();
    const brightness = dialog.getByRole("spinbutton",{name:"Brilho: valor",exact:true});
    await brightness.fill("-30");
    await expect.poll(() => pixels()).not.toBe(updatedText);
    await brightness.press("Tab");
    const adjusted = await pixels();
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(updatedText);
    await expect(brightness).toHaveValue("0");
    await dialog.getByRole("button",{name:"Refazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(adjusted);
    await expect(brightness).toHaveValue("-30");
    await dialog.getByRole("button",{name:"Filtros",exact:true}).click();
    await dialog.getByRole("button",{name:"Filtro P&B",exact:true}).click();
    await expect.poll(() => pixels()).not.toBe(adjusted);
    const filtered = await pixels();
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(adjusted);
    await dialog.getByRole("button",{name:"Refazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(filtered);
    await dialog.getByRole("button",{name:"Ajustes",exact:true}).click();
    await expect(brightness).toHaveValue("-30");
    await dialog.getByRole("button",{name:"Recortar",exact:true}).click();
    await dialog.getByRole("button",{name:"Girar foto",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => [c.width,c.height])).toEqual([100,160]);
    await dialog.getByRole("button",{name:"Formas",exact:true}).click();
    await move({x:5,y:70},{x:15,y:80});
    await dialog.getByRole("button",{name:"Recortar",exact:true}).click();
    await dialog.getByRole("button",{name:"Restaurar enquadramento",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => [c.width,c.height])).toEqual([200,120]);
    await expect.poll(() => canvas.evaluate(c => Array.from(c.getContext("2d").getImageData(45,35,1,1).data))).toEqual([255,255,255,255]);
    await expect.poll(() => canvas.evaluate(c => Array.from(c.getContext("2d").getImageData(95,100,1,1).data))).toEqual([255,255,255,255]);
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => [c.width,c.height])).toEqual([100,160]);
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => pixels()).toBe(filtered);
    await dialog.getByRole("button",{name:"Formas",exact:true}).click();
    if (process.env.IMAGE_EDITOR_SCREENSHOT_DIR) {
      await mkdir(process.env.IMAGE_EDITOR_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.IMAGE_EDITOR_SCREENSHOT_DIR, "desktop.png") });
    }
    await dialog.getByRole("button",{name:"Salvar foto",exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Editar foto foto-editada.png",exact:true})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"Editar foto outra.png",exact:true}).click();
    await expect(canvas).toBeVisible();
    await dialog.getByRole("button",{name:"Formas",exact:true}).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
    const canvasBounds = await canvas.boundingBox();
    const stageBounds = await canvas.locator("..").boundingBox();
    assert.ok(canvasBounds.width > 100 && canvasBounds.height > 100);
    await dialog.getByRole("button",{name:"Expandir configurações",exact:true}).click();
    await expect(dialog.getByRole("button",{name:"Expandir configurações",exact:true})).toHaveAttribute("aria-expanded","false");
    await expect.poll(async () => (await canvas.locator("..").boundingBox()).height).toBeGreaterThan(stageBounds.height);
    await dialog.getByRole("button",{name:"Expandir configurações",exact:true}).click();
    await dialog.getByRole("button",{name:"Recortar",exact:true}).click();
    await dialog.getByRole("button",{name:/1:1/}).click();
    await move({x:20,y:10},{x:150,y:70});
    await dialog.getByRole("button",{name:"Aplicar recorte",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => c.width === c.height)).toBe(true);
    await dialog.getByRole("button",{name:"Restaurar enquadramento",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => [c.width,c.height])).toEqual([200,120]);
    await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
    await expect.poll(() => canvas.evaluate(c => c.width === c.height)).toBe(true);
    await dialog.getByRole("button",{name:"Restaurar original",exact:true}).click();
    await expect.poll(() => pixels()).toBe(original);
    for (const [label,ratio] of [["16:9",16/9],["9:16",9/16]]) {
      await dialog.getByRole("button",{name:new RegExp(label)}).click();
      await move({x:10,y:10},{x:180,y:100});
      await dialog.getByRole("button",{name:"Aplicar recorte",exact:true}).click();
      await expect.poll(() => canvas.evaluate((c,ratio) => Math.abs(c.width/c.height-ratio),ratio)).toBeLessThan(.02);
      await dialog.getByRole("button",{name:"Desfazer",exact:true}).click();
      await expect.poll(() => pixels()).toBe(original);
    }
    await dialog.getByRole("button",{name:"Formas",exact:true}).click();
    if (process.env.IMAGE_EDITOR_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.IMAGE_EDITOR_SCREENSHOT_DIR, "mobile.png") });
    await page.setViewportSize({width:320,height:568});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    const saveBounds = await dialog.getByRole("button",{name:"Salvar foto",exact:true}).boundingBox();
    assert.ok(saveBounds.x >= 0 && saveBounds.x + saveBounds.width <= 320);
    await expect.poll(async () => (await canvas.boundingBox()).height).toBeGreaterThan(40);
    await dialog.getByRole("button",{name:"Cancelar",exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button",{name:"Enviar mensagem",exact:true}).click();
    await expect.poll(() => page.evaluate(() => window.sent?.length)).toBe(2);
    const result=await page.evaluate(() => ({sent:window.sent,caption:window.caption}));
    assert.equal(result.sent[0].name,"foto-editada.png");
    assert.equal(result.sent[0].type,"image/png");
    assert.equal(result.sent[0].pixels,filtered);
    assert.deepEqual([result.sent[0].width,result.sent[0].height],[160,100]);
    assert.equal(result.sent[1].name,"outra.png");
    assert.equal(result.sent[1].size,png.length);
    assert.deepEqual([result.sent[1].width,result.sent[1].height],[200,120]);
    assert.equal(result.caption,"Legenda da foto");
    await page.locator('input[type="file"]').setInputFiles({name:"quebrada.png",mimeType:"image/png",buffer:Buffer.from("not an image")});
    await page.getByRole("button",{name:"Editar foto quebrada.png",exact:true}).click();
    await expect(dialog.getByRole("alert")).toContainText("Não foi possível abrir esta imagem");
    await expect(dialog.getByRole("button",{name:"Salvar foto",exact:true})).toBeDisabled();
    await dialog.getByRole("button",{name:"Cancelar",exact:true}).click();
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
