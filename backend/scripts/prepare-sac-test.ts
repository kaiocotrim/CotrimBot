/**
 * Prepara somente o rascunho de um bot para testar a ação SAC_TEST.
 * Sem --apply, apenas mostra os bots e as opções atuais. Nunca publica um bot.
 * A publicação deve ocorrer no editor depois que o backend novo estiver no ar.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma.js';
import { validateFlow, type BotFlow, type BotOption } from '../src/services/bot-flow.js';
import type { Prisma } from '../generated/prisma/client.js';

try {
  const bots = await prisma.bot.findMany({ orderBy: { createdAt: 'asc' } });
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify(bots.map(bot => {
      const flow = bot.draft as unknown as BotFlow;
      return { id: bot.id, name: bot.name, hasPublished: Boolean(bot.published), menus: flow.menus.map(menu => ({ id: menu.id, name: menu.name, options: menu.options.map(option => ({ id: option.id, number: option.number, label: option.label, action: option.action })) })) };
    }), null, 2));
  } else {
    const botId = process.argv.find(arg => arg.startsWith('--bot='))?.slice(6);
    const bot = bots.find(item => item.id === botId);
    if (!bot) throw new Error('Informe --bot=ID de um bot existente. Execute sem --apply para listar.');
    const flow = structuredClone(bot.draft) as unknown as BotFlow;
    validateFlow(flow);
    const root = flow.menus.find(menu => menu.id === flow.rootMenuId)!;
    const optionId = process.argv.find(arg => arg.startsWith('--option='))?.slice(9);
    const allOptions = flow.menus.flatMap(menu => menu.options);
    if (optionId && !allOptions.some(option => option.id === optionId)) throw new Error('A opção indicada não pertence ao bot.');
    const candidates = allOptions.filter(option => optionId ? option.id === optionId : /(?:^|\s)abrir (?:um )?chamado\b/i.test(option.label) || option.action === 'SAC_TEST');
    if (candidates.length > 1) throw new Error('Há mais de uma opção de chamado. Configure a opção desejada pelo editor.');
    const candidate = candidates[0];
    if (candidate?.action === 'SAC_TEST' && !candidate.imageId && !candidate.targetMenuId && !candidate.response) { console.log('O rascunho já possui a ação SAC_TEST. Nenhuma alteração.'); }
    else {
      if (candidate) {
        candidate.action = 'SAC_TEST'; candidate.active = true;
        candidate.label = 'Abrir chamado (teste)'; candidate.response = '';
        // Uma coleta não reutiliza a imagem ou o submenu da ação anterior.
        candidate.targetMenuId = ''; delete candidate.imageId;
      }
      else {
        if (root.options.length >= 50) throw new Error('O menu atingiu o limite de opções.');
        let number = 1; while (root.options.some(option => option.number === String(number))) number++;
        const option: BotOption = { id: 'sac-test-' + Date.now(), number: String(number), label: 'Abrir chamado (teste)', active: true, action: 'SAC_TEST', response: '', targetMenuId: '' };
        root.options.push(option);
      }
      validateFlow(flow);
      const directory = fileURLToPath(new URL('../.sac-test-backups/', import.meta.url));
      await mkdir(directory, { recursive: true });
      const backup = `${directory}${bot.id}-${bot.revision}-${Date.now()}.json`;
      await writeFile(backup, JSON.stringify(bot, null, 2), { flag: 'wx' });
      const updated = await prisma.bot.updateMany({ where: { id: bot.id, revision: bot.revision }, data: { draft: flow as unknown as Prisma.InputJsonValue, revision: { increment: 1 } } });
      if (updated.count !== 1) throw new Error('O bot foi alterado durante a preparação. Recarregue antes de tentar novamente.');
      console.log(`Rascunho de "${bot.name}" preparado. A versão publicada permanece igual. Backup: ${backup}`);
    }
  }
} finally { await prisma.$disconnect(); }
