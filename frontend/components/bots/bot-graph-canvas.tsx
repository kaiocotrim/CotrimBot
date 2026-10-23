"use client";

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GitBranch, ImagePlus, ListTree, Maximize2, MessageSquare, Minus, Plus, SquareCheck, UserRound, Workflow, X, Unplug, Move, Play } from 'lucide-react';
import type { BotFlow, BotOption } from '@/lib/bot-api';
import { graphNodes, menuGraphId, type GraphNode, type GraphPoint } from '@/lib/bot-graph';
import styles from './bot-designer.module.css';

const colors = { menu: '#22d3ee', MESSAGE: '#60a5fa', SUBMENU: '#a78bfa', HUMAN: '#fbbf24', CLOSE: '#fb7185', IMAGE: '#60a5fa', SAC_TEST: '#2dd4bf' };
const names = { MESSAGE: 'Mensagem', SUBMENU: 'Ir para menu', HUMAN: 'Atendimento humano', CLOSE: 'Encerrar', IMAGE: 'Enviar imagem', SAC_TEST: 'Coleta de chamado' };
const icons = { MESSAGE: MessageSquare, SUBMENU: GitBranch, HUMAN: UserRound, CLOSE: SquareCheck, IMAGE: ImagePlus, SAC_TEST: Workflow };
const W = 160, H = 112;
const curve = (a: GraphPoint, b: GraphPoint) => `M ${a.x} ${a.y} C ${a.x + Math.max(70, Math.abs(b.x - a.x) / 2)} ${a.y}, ${b.x - Math.max(70, Math.abs(b.x - a.x) / 2)} ${b.y}, ${b.x} ${b.y}`;

export function BotGraphCanvas({ flow, dirty, disabled, selectedMenuId, selectedOptionId, activeMenuId, activeOptionId, onSelect, onLayout, onConnect, onAdd, onMenuView, onEditorHost }: {
  flow: BotFlow; dirty: boolean; disabled: boolean; selectedMenuId: string; selectedOptionId?: string;
  activeMenuId?: string; activeOptionId?: string;
  onSelect: (menuId: string, optionId?: string) => void;
  onLayout: (layout: Record<string, GraphPoint>) => void;
  onConnect: (optionId: string, targetMenuId: string | null) => void;
  onAdd: (action?: BotOption['action'], position?: GraphPoint) => void; onMenuView: () => void; onEditorHost: (host: HTMLDivElement | null) => void;
}) {
  const reduced = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), expandButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false), [editor, setEditor] = useState(false), [minimap, setMinimap] = useState(false);
  const [zoom, setZoom] = useState(0.85), [offset, setOffset] = useState({ x: 24, y: 24 });
  const [connection, setConnection] = useState<{ optionId: string; point: GraphPoint } | null>(null);
  const [edge, setEdge] = useState<string | null>(null), [hint, setHint] = useState('');
  const drag = useRef<{ kind: 'node' | 'pan'; id?: string; client: GraphPoint; origin: GraphPoint } | null>(null);
  const justConnected = useRef(false);
  const nodes = graphNodes(flow);
  const width = Math.max(900, ...nodes.map(n => n.x + W + 100)), height = Math.max(600, ...nodes.map(n => n.y + H + 100));
  const world = (x: number, y: number): GraphPoint => { const rect = viewport.current!.getBoundingClientRect(); return { x: (x - rect.left - offset.x) / zoom, y: (y - rect.top - offset.y) / zoom }; };
  const input = (n: GraphNode) => ({ x: n.x, y: n.y + H / 2 });
  const output = (n: GraphNode) => ({ x: n.x + W, y: n.y + H / 2 });
  function select(node: GraphNode) { onSelect(node.menu.id, node.option?.id); if (expanded) setEditor(true); }
  function finish(target: string) {
    if (!connection) return;
    onConnect(connection.optionId, target); setConnection(null); setHint('Ligação atualizada no rascunho. Salve para manter a alteração.');
  }
  function fit() {
    if (!viewport.current) return;
    const minX = Math.min(...nodes.map(n => n.x)), minY = Math.min(...nodes.map(n => n.y));
    const next = Math.max(0.2, Math.min(1, (viewport.current.clientWidth - 80) / (width - minX), (viewport.current.clientHeight - 80) / (height - minY)));
    setZoom(next); setOffset({ x: 40 - minX * next, y: 40 - minY * next });
  }
  useEffect(() => {
    const element = viewport.current; if (!element || disabled) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      const next = Math.max(0.2, Math.min(1.5, zoom * Math.exp(-event.deltaY * 0.002)));
      setOffset({ x: x - (x - offset.x) / zoom * next, y: y - (y - offset.y) / zoom * next }); setZoom(next);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom, offset, expanded, disabled]);
  useEffect(() => {
    if (!expanded) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; expandButton.current?.focus(); };
  }, [expanded]);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (connection) setConnection({ ...connection, point: world(event.clientX, event.clientY) });
    const current = drag.current; if (!current) return;
    const dx = event.clientX - current.client.x, dy = event.clientY - current.client.y;
    if (current.kind === 'node' && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (current.kind === 'pan') setOffset({ x: current.origin.x + dx, y: current.origin.y + dy });
    else onLayout({ ...flow.layout, [current.id!]: { x: Math.max(20, Math.min(10000, current.origin.x + dx / zoom)), y: Math.max(20, Math.min(10000, current.origin.y + dy / zoom)) } });
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (!connection) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-graph-input]');
    if (target?.dataset.graphInput) { justConnected.current = true; finish(target.dataset.graphInput); }
  }
  const source = connection ? nodes.find(node => node.option?.id === connection.optionId) : undefined;
  const canvas = <section className={`${styles.canvasPanel} ${styles.graphPanel}`} aria-label="Visão geral do fluxo" inert={disabled}>
    <div className={styles.canvasToolbar}><div><strong>Fluxo do bot</strong><span className={`${styles.badge} ${dirty ? styles.amber : styles.green}`}>{dirty ? 'Não salvo' : 'Salvo'}</span></div><div className={styles.canvasTools}>
      <div className={styles.zoom}><button aria-label="Diminuir zoom" onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Aumentar zoom" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}><Plus size={14} /></button></div>
      <button className={styles.toolButton} onClick={fit}>Ajustar</button>
      <button className={styles.toolButton} onClick={() => { const layout = Object.fromEntries(Object.entries(flow.layout ?? {}).filter(([key]) => !key.startsWith('graph:'))); onLayout(layout); setOffset({ x: 24, y: 24 }); setZoom(0.85); }}>Organizar</button>
      <button className={styles.toolButton} aria-pressed={minimap} onClick={() => setMinimap(!minimap)}>Minimapa</button>
      <select className={`${styles.toolButton} ${styles.flowMode}`} aria-label="Modo de visualização" value="overview" onChange={event => { if (event.target.value === "menu") onMenuView(); }}><option value="menu">Padrão</option><option value="overview">Modo 2 · n8n</option></select>
      {!expanded ? <button ref={expandButton} className={styles.toolButton} onClick={() => setExpanded(true)}><Maximize2 size={13} /> Tela cheia</button> : <><button className={styles.toolButton} onClick={() => setEditor(!editor)}>{editor ? 'Ocultar edição' : 'Editar nó'}</button><button className={styles.toolButton} aria-label="Fechar visão geral" onClick={() => { setExpanded(false); setEditor(false); }}><X size={14} /></button></>}
    </div></div>
    <div ref={viewport} data-graph-viewport className={`${styles.canvasViewport} ${styles.graphViewport}`} onDragOver={event => { if (event.dataTransfer.types.includes('application/cotrimbot-action')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={event => { event.preventDefault(); const action = event.dataTransfer.getData('application/cotrimbot-action'); if (!['MESSAGE', 'SUBMENU', 'HUMAN', 'IMAGE', 'CLOSE', 'SAC_TEST'].includes(action)) return; const point = world(event.clientX, event.clientY); onAdd(action as BotOption['action'], { x: Math.max(20, Math.min(10000, point.x)), y: Math.max(20, Math.min(10000, point.y)) }); }} onPointerMove={move} onPointerUp={release} onPointerCancel={() => { drag.current = null; setConnection(null); }} onKeyDown={event => { if (event.key === 'Escape') { if (connection) event.preventDefault(); event.stopPropagation(); setConnection(null); setEdge(null); } }} onPointerDown={event => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('[data-graph-node],button,path')) return;
      setEdge(null); setConnection(null); drag.current = { kind: 'pan', client: { x: event.clientX, y: event.clientY }, origin: offset }; event.currentTarget.setPointerCapture(event.pointerId);
    }}>
      <div className={styles.stage} style={{ width, height, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
        <svg className={styles.graphEdges} width={width} height={height} aria-label="Ligações entre blocos">
          {nodes.filter(node => node.option).map(node => {
            const menu = nodes.find(item => item.id === menuGraphId(node.menu.id))!;
            const index = node.menu.options.findIndex(option => option.id === node.option!.id);
            const start = { x: menu.x + W, y: menu.y + H * (index + 1) / (node.menu.options.length + 1) };
            const target = node.option!.action === 'SUBMENU' ? nodes.find(item => item.id === menuGraphId(node.option!.targetMenuId)) : undefined;
            return <g key={node.id}><path d={curve(start, input(node))} stroke={colors[node.option!.action]} opacity={node.option!.active ? 0.6 : 0.2} /><text x={start.x + 12} y={start.y - 8} fill={colors[node.option!.action]} fontSize={11}>{node.option!.number}</text>{target && <>
              <path d={curve(output(node), input(target))} stroke={colors.SUBMENU} strokeWidth={edge === node.option!.id ? 3 : 1.8} />
              <path d={curve(output(node), input(target))} className={styles.graphEdgeHit} role="button" tabIndex={0} aria-label={`Selecionar ligação ${node.option!.label} para ${target.menu.name}`} onClick={() => setEdge(node.option!.id)} onKeyDown={event => { if (event.key === 'Enter') setEdge(node.option!.id); }} />
            </>}</g>;
          })}
          {source && connection && <path d={curve(output(source), connection.point)} stroke={colors.SUBMENU} strokeDasharray="6 5" />}
        </svg>
        {nodes.map(node => {
          const color = node.option ? colors[node.option.action] : colors.menu;
          const Icon = node.option ? icons[node.option.action] : node.menu.id === flow.rootMenuId ? Play : ListTree;
          const isSelected = node.menu.id === selectedMenuId && (selectedOptionId ? node.option?.id === selectedOptionId : !node.option);
          const running = activeOptionId ? node.option?.id === activeOptionId : activeMenuId === node.menu.id && !node.option;
          const canConnect = node.option && ['MESSAGE', 'SUBMENU'].includes(node.option.action);
          return <motion.div key={node.id} data-graph-node={node.id} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: node.option && !node.option.active ? 0.45 : 1 }} transition={{ duration: reduced ? 0 : 0.18 }} className={`${styles.graphNode} ${isSelected ? styles.graphSelected : ''} ${running ? styles.graphRunning : ''}`} style={{ left: node.x, top: node.y, width: W, height: H, borderColor: color, color }} role="button" tabIndex={0} aria-label={`Editar ${node.option ? `opção ${node.option.number}: ${node.option.label}` : `menu ${node.menu.name}`}`} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node); } }} onPointerDown={event => {
            if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
            event.stopPropagation(); select(node); setEdge(null); drag.current = { kind: 'node', id: node.id, client: { x: event.clientX, y: event.clientY }, origin: { x: node.x, y: node.y } }; event.currentTarget.setPointerCapture(event.pointerId);
          }}>
            <span className={styles.graphIcon}><Icon size={30} strokeWidth={1.4} /></span>
            <span className={styles.graphNodeTitle}>{node.option?.label ?? node.menu.name}</span>
            <small>{node.option ? names[node.option.action] : `${node.menu.id === flow.rootMenuId ? 'Início · ' : ''}${node.menu.options.length} opções`}</small>
            {!node.option ? <>
              <button className={`${styles.graphPort} ${styles.graphInput}`} data-graph-input={node.menu.id} aria-label={`Entrada do menu ${node.menu.name}`} title="Conecte uma opção a este menu" onPointerDown={e => e.stopPropagation()} onClick={event => { event.stopPropagation(); if (!justConnected.current) finish(node.menu.id); justConnected.current = false; }} />
              {node.menu.options.map((option, index) => <span key={option.id} className={`${styles.graphPort} ${styles.graphOutput}`} style={{ top: `${100 * (index + 1) / (node.menu.options.length + 1)}%`, background: colors[option.action] }} title={`Opção ${option.number}: ${option.label}`} />)}
            </> : <><span className={`${styles.graphPort} ${styles.graphInput}`} />{canConnect && <button className={`${styles.graphPort} ${styles.graphOutput}`} aria-label={`Conectar saída da opção ${node.option.number} de ${node.menu.name}`} title="Arraste até a entrada de um menu ou clique e escolha o destino" onPointerDown={event => { event.stopPropagation(); justConnected.current = false; setConnection({ optionId: node.option!.id, point: output(node) }); event.currentTarget.setPointerCapture(event.pointerId); }} onClick={event => { event.stopPropagation(); if (justConnected.current) { justConnected.current = false; return; } setConnection({ optionId: node.option!.id, point: output(node) }); }} />}</>}
          </motion.div>;
        })}
      </div>
    </div>
    {edge && <div className={styles.graphEdgeActions}><button className={styles.button} onClick={() => { onConnect(edge, null); setEdge(null); setHint('Ligação removida. Configure a resposta da opção antes de publicar.'); }}><Unplug size={14} /> Remover ligação</button><button className={styles.iconButton} aria-label="Fechar seleção da ligação" onClick={() => setEdge(null)}><X size={14} /></button></div>}
    <div className={styles.canvasHint} role="status"><Move size={13} /> {connection ? 'Escolha a entrada de um menu · Esc para cancelar' : hint || 'Arraste para navegar · conecte as saídas das opções às entradas dos menus'}</div>
    <AnimatePresence>{minimap && <motion.button className={styles.minimap} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label="Navegar pela visão geral" onClick={event => { if (!viewport.current) return; const rect = event.currentTarget.getBoundingClientRect(); setOffset({ x: viewport.current.clientWidth / 2 - (event.clientX - rect.left) / rect.width * width * zoom, y: viewport.current.clientHeight / 2 - (event.clientY - rect.top) / rect.height * height * zoom }); }}><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">{nodes.map(node => <rect key={node.id} x={node.x} y={node.y} width={W} height={H} rx={12} fill={node.option ? colors[node.option.action] : colors.menu} />)}</svg></motion.button>}</AnimatePresence>
    <button className={styles.addFloating} onClick={() => onAdd()}><Plus size={14} /> Adicionar opção</button>
  </section>;
  return expanded ? <dialog ref={dialog} className={styles.flowDialog} aria-label="Visão geral ampliada" onCancel={() => { setExpanded(false); setEditor(false); }}>{canvas}<fieldset hidden={!editor} disabled={disabled} className={styles.expandedEditor}><div ref={onEditorHost} className={styles.expandedEditorContent} /></fieldset></dialog> : canvas;
}
