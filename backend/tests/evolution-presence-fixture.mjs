import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { build } from 'esbuild';
import { patchEvolutionPresence } from '../../evolution-polls/presence-patch.mjs';
import { attachBaileysChats } from './fixtures/evolution-presence/baileys-chats.mjs';

export async function loadPatchedPresence() {
  const root = await mkdtemp(path.join(tmpdir(), 'cotrimbot-evolution-presence-'));
  const sourcePaths = {
    channel: 'src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts',
    router: 'src/api/routes/chat.router.ts',
    webhook: 'src/api/integrations/event/webhook/webhook.controller.ts',
  };
  try {
    for (const [kind, target] of Object.entries(sourcePaths)) {
      await mkdir(path.dirname(path.join(root, target)), { recursive: true });
      await copyFile(new URL(`./fixtures/evolution-presence/${kind === 'router' ? 'chat.router' : kind}.ts`, import.meta.url), path.join(root, target));
    }
    await patchEvolutionPresence(root);
    const modules = {
      '@api/server.module': `export const waMonitor={waInstances:{}};export const chatController={};`,
      '@api/abstract/abstract.router': `import{Router}from'express';export class RouterBroker{router=Router();routerPath(name){return '/'+name+'/:instanceName'}}`,
      './index.router': `export const HttpStatus={OK:200,BAD_REQUEST:400};`,
      '@config/env.config': `export const state={local:{enabled:false,events:['PRESENCE_UPDATE'],url:'',webhookByEvents:false},config:{WEBHOOK:{GLOBAL:{ENABLED:true,URL:'',WEBHOOK_BY_EVENTS:false},EVENTS:{PRESENCE_UPDATE:true},REQUEST:{TIMEOUT_MS:2000},RETRY:{MAX_ATTEMPTS:1,NON_RETRYABLE_STATUS_CODES:[400,404]}},LOG:{LEVEL:['WEBHOOKS']}},logs:[]};export const configService={get:key=>state.config[key]};`,
      '@config/logger.config': `import{state}from'@config/env.config';export class Logger{log(data){state.logs.push(data)}error(data){state.logs.push(data)}}`,
      '../event.controller': `import{state}from'@config/env.config';export class EventController{async get(){return state.local}}`,
      'jsonwebtoken': `export const sign=()=>{throw new Error('JWT not used by presence fixtures')};`,
      'axios': `export default{create:({baseURL,headers,timeout})=>({post:async(_,body)=>{const response=await fetch(baseURL,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});if(!response.ok){const error=new Error('Local fixture HTTP failure');error.response={status:response.status};throw error}return{status:response.status}}})};`,
    };
    const compiled = await build({
      stdin: { resolveDir: root, loader: 'ts', contents: `export {ChannelFixture} from './${sourcePaths.channel}';export{ChatRouter}from'./${sourcePaths.router}';export{WebhookController}from'./${sourcePaths.webhook}';export{waMonitor}from'@api/server.module';export{state}from'@config/env.config';export*from'@api/integrations/channel/whatsapp/cotrimbot-presence';` },
      bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
      plugins: [{ name: 'upstream-boundaries', setup(builder) {
        builder.onResolve({ filter: /./ }, ({ path: name }) => {
          if (name === 'express') return { path: name, external: true };
          if (name in modules) return { path: name, namespace: 'fixture' };
          if (name === '@api/integrations/channel/whatsapp/cotrimbot-presence') return { path: path.join(root, 'src/api/integrations/channel/whatsapp/cotrimbot-presence.ts') };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: modules[name], loader: 'js' }));
      } }],
    });
    const mod = { exports: {} };
    runInThisContext(`(function(require,module,exports){${compiled.outputFiles[0].text}\n})`)(createRequire(import.meta.url), mod, mod.exports);
    return { ...mod.exports, root, sourcePaths, cleanup: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

export function baileysFixture() {
  const emitter = new EventEmitter();
  const ws = new EventEmitter();
  const nodes = [];
  const ev = {
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
    process: listener => { emitter.on('batch', listener); },
    emit: (event, payload) => { emitter.emit(event, payload); emitter.emit('batch', { [event]: payload }); },
    listenerCount: event => emitter.listenerCount(event),
  };
  const { presenceSubscribe } = attachBaileysChats({ ev, ws, sendNode: async node => { nodes.push(node); } });
  return { ev, ws, nodes, presenceSubscribe, user: { id: '5511888888888@s.whatsapp.net' }, authState: { keys: { get: async () => ({}) } } };
}
