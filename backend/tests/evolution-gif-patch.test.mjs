import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { patchEvolutionGifs } from "../../evolution-polls/gif-patch.mjs";

test("GIF patch keeps regular videos unchanged and enables explicit GIF playback", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cotrimbot-gif-"));
  try {
    const dtoPath = path.join(root, "src/api/dto/sendMessage.dto.ts");
    const servicePath = path.join(root, "src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts");
    const routerPath = path.join(root, "src/api/routes/sendMessage.router.ts");
    await mkdir(path.dirname(dtoPath), { recursive: true });
    await mkdir(path.dirname(servicePath), { recursive: true });
    await mkdir(path.dirname(routerPath), { recursive: true });
    await writeFile(dtoPath, "export class MediaMessage {\n}\nexport class SendMediaDto extends Metadata {\n}\n");
    await writeFile(servicePath, "if (mediaMessage.mediatype === 'video') { prepareMedia[mediaType].gifPlayback = false; }");
    await writeFile(routerPath, ".post(this.routerPath('sendMedia'), ...guards, handler)");
    await patchEvolutionGifs(root);
    const first = await readFile(servicePath, "utf8");
    const expression = first.match(/gifPlayback = ([^;]+);/)[1];
    const enabled = new Function("mediaMessage", `return ${expression}`);
    assert.equal(enabled({}), false);
    assert.equal(enabled({ gifPlayback: true }), true);
    assert.equal(enabled({ gifPlayback: "true" }), false);
    await patchEvolutionGifs(root);
    assert.equal(await readFile(servicePath, "utf8"), first);
    const dto = await readFile(dtoPath, "utf8");
    assert.equal((dto.match(/gifPlayback\?: boolean/g) || []).length, 2);
    const router = await readFile(routerPath, "utf8");
    assert.equal((router.match(/routerPath\('sendGif'\)/g) || []).length, 1);
    assert.match(router, /sendGif'\), \.\.\.guards/);
    assert.match(router, /gifPlayback: true/);
    // Executa a rota gerada, incluindo o contrato de validação e as guardas.
    const routes = new Map();
    const calls = [];
    const guards = [() => {}, () => {}];
    const harness = {
      router: { post(route, ...handlers) { routes.set(route, handlers); return this; } },
      routerPath: (action) => `/message/${action}/:instanceName`,
      dataValidate: async ({ request, execute }) => execute({ instanceName: request.params.instanceName }),
    };
    const executable = router.replace(/\.dataValidate<SendMediaDto>/g, ".dataValidate");
    new Function("guards", "handler", "SendMediaDto", "mediaMessageSchema", "sendMessageController", "HttpStatus", `this.router${executable};`).call(harness, guards, () => {}, class {}, {}, {
      sendMedia: async (instance, body) => { calls.push({ instance, body }); return { key: { id: "gif-native" } }; },
    }, { CREATED: 201 });
    const handlers = routes.get("/message/sendGif/:instanceName");
    assert.deepEqual(handlers.slice(0, -1), guards);
    const response = { code: null, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers.at(-1)({ params: { instanceName: "connected-instance" }, body: { number: "5511999999999", media: "AAAA", mediatype: "image", mimetype: "image/gif", gifPlayback: false, caption: "Legenda" } }, response);
    assert.equal(response.code, 201);
    assert.equal(calls[0].instance.instanceName, "connected-instance");
    assert.equal(calls[0].body.gifPlayback, true);
    assert.equal(calls[0].body.mediatype, "video");
    assert.equal(calls[0].body.mimetype, "video/mp4");
    assert.equal(calls[0].body.caption, "Legenda");
    await writeFile(servicePath, "unsupported upstream source");
    await assert.rejects(patchEvolutionGifs(root), /supported 2.3.7/);
    assert.equal(await readFile(dtoPath, "utf8"), dto);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
