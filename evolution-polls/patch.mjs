import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchEvolutionPresence } from './presence-patch.mjs';

export async function patchEvolutionPolls(root) {
  if (!root) throw new Error('Usage: node patch.mjs <Evolution source directory>');
  const source = path.join(root, 'src/api/routes/sendMessage.router.ts');
  let router = await readFile(source, 'utf8');
  const marker = "      .post(this.routerPath('sendPoll'),";
  if (!router.includes(marker) || !router.includes("import { sendMessageController } from '@api/server.module';")) {
    throw new Error('Evolution source differs from supported version 2.3.7; patch not applied.');
  }
  router = router.replace("import { sendMessageController } from '@api/server.module';", `import { sendMessageController, waMonitor } from '@api/server.module';
import { generateWAMessageFromContent, jidNormalizedUser, proto } from 'baileys';
import { sendNativePollVote } from '@api/integrations/channel/whatsapp/cotrimbot-poll-vote';`);
  router = router.replace(marker, `      .post(this.routerPath('sendPollVote'), ...guards, async (req, res) => {
        try {
          const instance = (waMonitor.waInstances as any)[req.params.instanceName];
          const result = await sendNativePollVote(instance, req.body, { generateWAMessageFromContent, jidNormalizedUser, proto });
          return res.status(HttpStatus.CREATED).json(result);
        } catch (error) {
          return res.status(HttpStatus.BAD_REQUEST).json({ message: error instanceof Error ? error.message : 'Unable to send poll vote' });
        }
      })
${marker}`);
  await copyFile(fileURLToPath(new URL('./native-poll-vote.ts', import.meta.url)), path.join(root, 'src/api/integrations/channel/whatsapp/cotrimbot-poll-vote.ts'));
  await writeFile(source, router);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await patchEvolutionPolls(process.argv[2]);
  await patchEvolutionPresence(process.argv[2]);
}
