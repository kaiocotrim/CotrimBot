import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { build } from "esbuild";
import { patchEvolutionPolls } from "../../evolution-polls/patch.mjs";

test("patched Evolution route resolves :instanceName and sends through the connected instance", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cotrimbot-poll-route-"));
  try {
    const route = path.join(root, "src/api/routes/sendMessage.router.ts");
    await mkdir(path.dirname(route), { recursive: true });
    await mkdir(path.join(root, "src/api/integrations/channel/whatsapp"), { recursive: true });
    // Minimal upstream MessageRouter. RouterBroker's parameter name follows the
    // pinned 2.3.7 source: src/api/abstract/abstract.router.ts, routerPath().
    await writeFile(route, `
import { RouterBroker } from '@api/abstract/abstract.router';
import { sendMessageController } from '@api/server.module';
import { HttpStatus } from './index.router';
export class MessageRouter extends RouterBroker {
  constructor(...guards: any[]) {
    super();
    this.router
      .post(this.routerPath('sendPoll'), ...guards, (_req, res) => res.json({}));
  }
}
`);
    await patchEvolutionPolls(root);
    const modules = {
      "@api/abstract/abstract.router": `import {Router} from 'express'; export class RouterBroker { router = Router(); routerPath(name) { return '/' + name + '/:instanceName'; } }`,
      "@api/server.module": `export const waMonitor = {waInstances: {}}; export const sendMessageController = {};`,
      "./index.router": `export const HttpStatus = {CREATED: 201, BAD_REQUEST: 400};`,
      "baileys": `
        export const jidNormalizedUser = jid => jid.replace(/:\\d+@/, '@');
        export const proto = {Message: {PollVoteMessage: {encode: ({selectedOptions}) => ({finish: () => Buffer.concat(selectedOptions)})}}};
        export const generateWAMessageFromContent = (remoteJid, message) => ({key: {id: 'vote-id', remoteJid, fromMe: true}, message});`,
    };
    const compiled = await build({
      stdin: { contents: `export {MessageRouter} from ${JSON.stringify(route)}; export {waMonitor} from '@api/server.module';`, resolveDir: root, loader: "ts" },
      bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
      plugins: [{ name: "upstream-contract", setup(builder) {
        builder.onResolve({ filter: /./ }, ({ path: module }) => {
          if (module === "express") return { path: module, external: true };
          if (module in modules) return { path: module, namespace: "fixture" };
          if (module === "@api/integrations/channel/whatsapp/cotrimbot-poll-vote") return { path: path.join(root, "src/api/integrations/channel/whatsapp/cotrimbot-poll-vote.ts") };
        });
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: module }) => ({ contents: modules[module], loader: "js" }));
      } }],
    });
    const module = { exports: {} };
    runInThisContext(`(function(require,module,exports){${compiled.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
    const { MessageRouter, waMonitor } = module.exports;
    const relays = [], events = [];
    waMonitor.waInstances.connected = {
      client: { user: { id: "5511888888888:2@s.whatsapp.net", name: "Conta" }, relayMessage: async (...args) => { relays.push(args); }, ev: { emit: (...args) => events.push(args) } },
      getMessage: async () => ({
        key: { id: "poll-id", remoteJid: "5511999999999@s.whatsapp.net", fromMe: true },
        message: { messageContextInfo: { messageSecret: Buffer.alloc(32, 1).toString("base64") }, pollCreationMessageV3: { options: [{ optionName: "Sim" }, { optionName: "Não" }], selectableOptionsCount: 1 } },
      }),
    };
    let guarded = 0;
    const router = new MessageRouter((_req, _res, next) => { guarded++; next(); }).router;
    const invoke = (instance, optionIndexes) => new Promise((resolve, reject) => {
      const req = { method: "POST", url: `/sendPollVote/${instance}`, headers: {}, body: { number: "5511999999999", messageId: "poll-id", optionIndexes } };
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } };
      router.handle(req, res, (error) => reject(error ?? new Error("Vote route not found")));
    });
    const sent = await invoke("connected", [0]);
    assert.equal(sent.code, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.voterId, "5511888888888@s.whatsapp.net");
    assert.equal(guarded, 1);
    assert.equal(relays.length, 1);
    assert.equal(events[0][0], "messages.upsert");
    assert.equal((await invoke("connected", [-1])).code, 400);
    assert.equal((await invoke("missing", [0])).code, 400);
    assert.equal(relays.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
