import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function patchEvolutionReceipts(root) {
  const file = path.join(root, 'src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts');
  let source = await readFile(file, 'utf8');
  const marker = '  private eventHandler() {\n';
  if (source.includes("import { observeNativeMessageReceipts }")) return;
  if (source.split(marker).length !== 2 || !source.includes("events['message-receipt.update']")) throw new Error('Evolution receipt patch requires the pinned 2.3.7 source.');
  source = `import { observeNativeMessageReceipts } from './cotrimbot-message-receipts';\n${source}`;
  source = source.replace(marker, `${marker}    observeNativeMessageReceipts(this.client, {
      active: () => !this.endSession,
      ignoreGroups: () => Boolean(this.localSettings.groupsIgnore),
      forward: (payload) => this.sendDataWebhook(Events.MESSAGES_UPDATE, payload),
    });
`);
  await copyFile(fileURLToPath(new URL('./native-message-receipts.ts', import.meta.url)), path.join(root, 'src/api/integrations/channel/whatsapp/cotrimbot-message-receipts.ts'));
  await writeFile(file, source);
}
