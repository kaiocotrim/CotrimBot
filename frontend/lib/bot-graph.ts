import type { BotFlow, BotMenu, BotOption } from './bot-api';

export type GraphPoint = { x: number; y: number };
export type GraphNode = { id: string; menu: BotMenu; option?: BotOption; x: number; y: number };
export const menuGraphId = (id: string) => `graph:${id}:menu`;
export const optionGraphId = (menuId: string, id: string) => `graph:${menuId}:${id}`;

/** Projeta o contrato de menus existente; não cria um segundo formato de execução. */
export function graphNodes(flow: BotFlow, saved = true): GraphNode[] {
  const depths = new Map<string, number>([[flow.rootMenuId, 0]]);
  const queue = [flow.rootMenuId];
  for (let i = 0; i < queue.length; i++) {
    const menu = flow.menus.find(item => item.id === queue[i]);
    for (const option of menu?.options ?? []) if (option.action === 'SUBMENU' && !depths.has(option.targetMenuId)) {
      depths.set(option.targetMenuId, Math.min(14, depths.get(menu!.id)! + 1)); queue.push(option.targetMenuId);
    }
  }
  const rows = new Map<number, number>();
  const disconnectedDepth = Math.min(14, Math.max(...depths.values()) + 1);
  return [...flow.menus].sort((a, b) => (depths.get(a.id) ?? disconnectedDepth) - (depths.get(b.id) ?? disconnectedDepth)).flatMap(menu => {
    const depth = depths.get(menu.id) ?? disconnectedDepth;
    const x = 80 + depth * 520, y = rows.get(depth) ?? 80;
    rows.set(depth, y + Math.max(210, menu.options.length * 150 + 60));
    const nodes: GraphNode[] = [{ id: menuGraphId(menu.id), menu, x, y }, ...menu.options.map((option, i) => ({ id: optionGraphId(menu.id, option.id), menu, option, x: x + 260, y: y + i * 150 }))];
    return nodes.map(node => ({ ...node, ...(saved ? flow.layout?.[node.id] : {}) }));
  });
}

/** Só ações de mensagem/submenu podem encaminhar para outro menu. */
export function connectBotOption(flow: BotFlow, optionId: string, targetMenuId: string | null): BotFlow {
  if (targetMenuId && !flow.menus.some(menu => menu.id === targetMenuId)) throw new Error('Menu de destino inexistente.');
  const source = flow.menus.flatMap(menu => menu.options).find(option => option.id === optionId);
  if (!source || !['MESSAGE', 'SUBMENU'].includes(source.action)) throw new Error('Esta ação não permite conexão com outro menu.');
  return { ...flow, menus: flow.menus.map(menu => ({ ...menu, options: menu.options.map(option => option.id === optionId
    ? { ...option, action: targetMenuId ? 'SUBMENU' as const : 'MESSAGE' as const, targetMenuId: targetMenuId ?? '' } : option) })) };
}
