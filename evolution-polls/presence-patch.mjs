import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function patchEvolutionPresence(root) {
  const channelFile = path.join(root, 'src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts');
  const routerFile = path.join(root, 'src/api/routes/chat.router.ts');
  const webhookFile = path.join(root, 'src/api/integrations/event/webhook/webhook.controller.ts');
  let [channel, router, webhook] = await Promise.all([channelFile, routerFile, webhookFile].map(file => readFile(file, 'utf8')));
  const oldPresence = `            if (events['presence.update']) {
              const payload = events['presence.update'];

              if (settings?.groupsIgnore && payload.id.includes('@g.us')) {
                return;
              }

              this.sendDataWebhook(Events.PRESENCE_UPDATE, payload);
            }

`;
  const once = (text, marker) => text.split(marker).length === 2;
  if (!once(channel, oldPresence) || !once(channel, '  private eventHandler() {\n')
    || !once(router, "import { chatController } from '@api/server.module';")
    || !once(router, "      .post(this.routerPath('sendPresence'),")
    || !once(webhook, "    super(prismaRepository, waMonitor, true, 'webhook');")
    || !once(webhook, '    const instance = (await this.get(instanceName)) as wa.LocalWebHook;')
    || !once(webhook, '    const webhookLocal = instance?.events;')
    || !once(webhook, "const enabledLog = configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS');")
    || !once(webhook, '        attempts++;')
    || !once(webhook, "        await httpService.post('', webhookData);")) {
    throw new Error('Evolution presence patch requires the pinned 2.3.7 source; nothing written.');
  }
  channel = `import { observeNativePresence } from './cotrimbot-presence';\n${channel}`;
  channel = channel.replace('  private eventHandler() {\n', `  private eventHandler() {
    observeNativePresence(this.client, {
      active: () => !this.endSession,
      ignoreGroups: () => Boolean(this.localSettings.groupsIgnore),
      forward: (payload) => this.sendDataWebhook(Events.PRESENCE_UPDATE, payload),
    });
`);
  channel = channel.replace(oldPresence, '');
  router = router.replace("import { chatController } from '@api/server.module';", `import { chatController, waMonitor } from '@api/server.module';
import { subscribeNativePresence } from '@api/integrations/channel/whatsapp/cotrimbot-presence';`);
  router = router.replace("      .post(this.routerPath('sendPresence'),", `      .post(this.routerPath('subscribePresence'), ...guards, async (req, res) => {
        try {
          const result = await subscribeNativePresence((waMonitor.waInstances as any)[req.params.instanceName], req.body);
          return res.status(HttpStatus.OK).json(result);
        } catch {
          return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Unable to subscribe to WhatsApp presence' });
        }
      })
      .post(this.routerPath('sendPresence'),`);
  webhook = `import { presenceTrace, presenceSummary } from '@api/integrations/channel/whatsapp/cotrimbot-presence';\n${webhook}`;
  webhook = webhook.replace("    super(prismaRepository, waMonitor, true, 'webhook');", `    super(prismaRepository, waMonitor, true, 'webhook');
    const presenceConfig = configService.get<Webhook>('WEBHOOK');
    presenceTrace('webhook_startup', {
      globalEnabled: Boolean(presenceConfig.GLOBAL?.ENABLED),
      globalEvent: Boolean(presenceConfig.EVENTS?.PRESENCE_UPDATE),
      globalByEvents: Boolean(presenceConfig.GLOBAL?.WEBHOOK_BY_EVENTS),
    });`);
  webhook = webhook.replace('    const instance = (await this.get(instanceName)) as wa.LocalWebHook;', `    if (event === 'presence.update') presenceTrace('webhook_enter', presenceSummary(data));
    const instance = (await this.get(instanceName)) as wa.LocalWebHook;`);
  webhook = webhook.replace('    const webhookLocal = instance?.events;', `    const webhookLocal = instance?.events;
    if (event === 'presence.update') presenceTrace('webhook_config', {
      localEnabled: Boolean(local && instance?.enabled),
      localEvent: Array.isArray(webhookLocal) && webhookLocal.includes('PRESENCE_UPDATE'),
      localByEvents: Boolean(instance?.webhookByEvents),
      globalEnabled: Boolean(webhookConfig.GLOBAL?.ENABLED),
      globalEvent: Boolean(webhookConfig.EVENTS?.PRESENCE_UPDATE),
      globalByEvents: Boolean(webhookConfig.GLOBAL?.WEBHOOK_BY_EVENTS),
    });`);
  // The existing WEBHOOKS log dumps the whole payload, including apikey. Use safe traces for presence.
  webhook = webhook.replace("const enabledLog = configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS');", "const enabledLog = event !== 'presence.update' && configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS');");
  webhook = webhook.replace("        await httpService.post('', webhookData);", `        if (webhookData.event === 'presence.update') presenceTrace('webhook_http_attempt', { scope: origin.endsWith('-Global') ? 'global' : 'local', attempt: attempts + 1, ...presenceSummary(webhookData.data) });
        const presenceResponse = await httpService.post('', webhookData);
        if (webhookData.event === 'presence.update') presenceTrace('webhook_http_response', { scope: origin.endsWith('-Global') ? 'global' : 'local', status: presenceResponse.status });`);
  webhook = webhook.replace('        attempts++;', `        attempts++;
        if (webhookData.event === 'presence.update') presenceTrace('webhook_http_failed', { scope: origin.endsWith('-Global') ? 'global' : 'local', status: Number(error?.response?.status) || 0, timeout: error?.code === 'ECONNABORTED' });`);
  await copyFile(fileURLToPath(new URL('./native-presence.ts', import.meta.url)), path.join(root, 'src/api/integrations/channel/whatsapp/cotrimbot-presence.ts'));
  await Promise.all([[channelFile, channel], [routerFile, router], [webhookFile, webhook]].map(([file, contents]) => writeFile(file, contents)));
}
