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

test("shared contact cards open registration, save on submit, and message saved and unsaved numbers", async () => {
  const frontend = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(new URL("../package.json", import.meta.url));
  const bundle = await build({
    absWorkingDir: frontend, outfile: "shared.js",
    alias: { react: path.dirname(require.resolve("react/package.json")) },
    plugins: [{ name: "account-stubs", setup(build) {
      const modules = {
        "@/lib/auth-client": 'const session={data:{user:{id:"me",name:"Teste"},session:{}}}; export const useSession=()=>session; export const authClient={organization:{list:async()=>({data:[]})}};',
        "@/lib/internal-chat-api": 'export const preloadInternalChat=async()=>{}; export const setInternalChatIdentity=()=>{};',
        "@/components/chat/chat-navigation-rail": 'export const ChatNavigationRail=()=>null;',
      };
      build.onResolve({ filter: /^@\/(lib\/(auth-client|internal-chat-api)|components\/chat\/chat-navigation-rail)$/ }, ({ path }) => ({ path, namespace: "test" }));
      build.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({ contents: modules[path], loader: "js" }));
    } }],
    stdin: { resolveDir: frontend, loader: "jsx", contents: `
      import React,{useRef,useState} from "react";
      import {createRoot} from "react-dom/client";
      import {SharedContactMessage} from "@/components/chat/shared-contact-message";
      import {ContactSidebar} from "@/components/chat/contact-sidebar";
      import {saveContact,startContactConversation} from "@/lib/chat-api";
      window.calls=[]; window.failSave=false; window.failMessage=false;
      function App(){
        const form=useRef(null);
        const [saved,setSaved]=useState([{id:2,name:"Bruno",phone:"+55 (11) 99999-9999",isSaved:true}]);
        const [open,setOpen]=useState(false);
        const noop=async()=>{};
        return <div style={{display:"flex",height:"100dvh"}}>
          <ContactSidebar newContactFormRef={form} userId="me" contacts={saved} selectedContactId={99}
            loading={false} error={null} onSelectContact={noop} onLoadSavedContacts={async()=>saved}
            onSaveContact={async(name,phone,company,job,openConversation)=>{
              window.calls.push({name,phone,company,job,openConversation});
              if(window.failSave)throw new Error("Falha no salvamento");
              const contact=await saveContact(name,phone,company,job);
              setSaved(current=>[...current,contact]); return [...saved,contact];
            }} onArchiveContact={noop} onPinContact={noop} mobileOpen={open} revealForSwipe={false}
            onMobileOpenChange={setOpen} notifications={[]} notificationUnreadCount={0}
            notificationPermission="unsupported" onRequestNotificationPermission={noop}
            onOpenNotification={noop} onMarkAllNotificationsRead={noop} onClearNotifications={noop}/>
          <main style={{padding:20}}><SharedContactMessage
            contacts={[{name:"Kaio Cotrim",phone:"5511932075075"},{name:"Bruno",phone:"5511999999999"}]}
            savedContacts={saved}
            onSave={async(name,phone)=>{form.current.openNewContact({name,phone});setOpen(true);}}
            onMessage={async(name,phone)=>{
              if(window.failMessage)throw new Error("Falha ao abrir conversa");
              window.opened=saved.find(contact=>contact.phone.replace(/\\D/g,"")===phone)??await startContactConversation(phone);
            }}/></main>
        </div>;
      }
      createRoot(document.getElementById("root")).render(<App/>);` },
    bundle: true, write: false, jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_API_URL": '"/api"' },
  });
  const css = await postcss([tailwind({ base: frontend })]).process('@import "tailwindcss";', { from: path.join(frontend, "app/globals.css") });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 920 }, reducedMotion: "reduce" });
    const errors = [], mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://shared.test/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/clients") await route.fulfill({ json: { clients: [{ id: "company", name: "Empresa de teste" }] } });
      else if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        mutations.push({ path: url.pathname, body });
        await route.fulfill({ json: { id: 3, name: "+" + body.phone, ...body, isSaved: url.pathname === "/api/contacts", isGroup: false } });
      } else await route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://shared.test/");
    await page.addStyleTag({ content: css.css + "body{margin:0;background:#090909;color:white}" });
    for (const file of bundle.outputFiles.filter((file) => file.path.endsWith(".css"))) await page.addStyleTag({ content: file.text });
    await page.addScriptTag({ content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text });
    const save = page.getByRole("button", { name: "Salvar contato", exact: true });
    await expect(page.getByRole("button", { name: "Contato salvo", exact: true })).toBeDisabled();
    await expect(save).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Mandar mensagem", exact: true })).toHaveCount(2);
    await save.click();
    const form = page.getByRole("complementary", { name: "Novo contato", exact: true });
    await expect(form.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Kaio");
    await expect(form.getByRole("textbox", { name: "Sobrenome", exact: true })).toHaveValue("Cotrim");
    await expect(form.getByRole("textbox", { name: "Número de telefone", exact: true })).toHaveValue("11932075075");
    assert.deepEqual(mutations, []);
    await form.getByRole("button", { name: "Voltar à conversa" }).click();
    await expect(save).toBeVisible();
    await page.getByRole("button", { name: "Mandar mensagem", exact: true }).first().click();
    await expect.poll(() => page.evaluate(() => window.opened?.isSaved)).toBe(false);
    assert.equal(mutations[0].path, "/api/contacts/conversation");
    await expect(save).toBeVisible();
    await page.getByRole("button", { name: "Mandar mensagem", exact: true }).last().click();
    await expect.poll(() => page.evaluate(() => window.opened?.id)).toBe(2);
    assert.equal(mutations.length, 1);
    await page.evaluate(() => { window.failMessage = true; });
    await page.getByRole("button", { name: "Mandar mensagem", exact: true }).first().click();
    await expect(page.getByRole("alert")).toHaveText("Falha ao abrir conversa");
    await page.evaluate(() => { window.failMessage = false; });
    await page.setViewportSize({ width: 390, height: 844 });
    await save.click();
    await expect(form).toBeVisible();
    await form.getByRole("combobox", { name: "Empresa" }).click();
    await form.getByRole("option", { name: "Empresa de teste" }).click();
    await page.screenshot({ path: path.join(os.tmpdir(), "cotrimbot-shared-contact-form.png") });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.evaluate(() => { window.failSave = true; });
    await form.getByRole("button", { name: "Salvar contato", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText("Falha no salvamento");
    assert.equal(mutations.length, 1);
    await page.evaluate(() => { window.failSave = false; });
    await form.getByRole("button", { name: "Salvar contato", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Contato salvo", exact: true })).toHaveCount(2);
    assert.equal(await save.count(), 0);
    assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), { name: "Kaio Cotrim", phone: "5511932075075", company: "Empresa de teste", job: "", openConversation: false });
    assert.equal(mutations[1].path, "/api/contacts");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
