"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CornerDownLeft, GitBranch, GripHorizontal, ListTree, Maximize2, ImagePlus, MessageSquare, Minus, Play, Plus, SquareCheck, UserRound, X } from "lucide-react";
import type { BotFlow, BotMenu, BotOption } from "@/lib/bot-api";
import styles from "./bot-designer.module.css";

export type NodeSelection = { kind: "message" | "menu" | "option"; optionId?: string };
type Point = { x: number; y: number };
type FlowNode = { id: string; kind: "start" | "return" | NodeSelection["kind"]; x: number; y: number; w: number; h: number; option?: BotOption };
const accents = { green: '#4ade80', cyan: '#22d3ee', blue: '#60a5fa', purple: '#a78bfa', amber: '#fbbf24', red: '#fb7185', teal: '#2dd4bf', slate: '#94a3b8' };
function nodeTone(node: FlowNode): keyof typeof accents {
  if (node.kind === 'start') return 'green';
  if (node.kind === 'menu') return 'cyan';
  if (node.kind === 'return') return 'slate';
  return node.option?.action === 'HUMAN' ? 'amber' : node.option?.action === 'CLOSE' ? 'red'
    : node.option?.action === 'SUBMENU' ? 'purple' : node.option?.action === 'SAC_TEST' ? 'teal' : 'blue';
}

export function FlowCanvas({ flow, menu, selection, dirty, disabled, onSelect, onLayout, onAdd, onOpenMenu, onEditorHost, onCreateSubmenu, activeMenuId, activeOptionId, onTestOption, onOverview }: {
  flow: BotFlow; menu: BotMenu; selection: NodeSelection; dirty: boolean; disabled: boolean;
  activeMenuId?: string; activeOptionId?: string; onTestOption: (number: string) => void;
  onSelect: (selection: NodeSelection) => void;
  onLayout: (positions: Record<string, Point>) => void;
  onAdd: (action: BotOption["action"], position?: Point) => void;
  onOpenMenu: (id: string) => void;
  onEditorHost: (host: HTMLDivElement | null) => void;
  onCreateSubmenu: (optionId: string) => void;
  onOverview?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const contextMenuElement = useRef<HTMLDivElement>(null);
  const contextFocus = useRef<HTMLElement | null>(null);
  const wasExpanded = useRef(false);
  const drag = useRef<{ id: string; pointer: Point; origin: Point; moved: boolean } | null>(null);
  const pan = useRef<{ pointer: Point; origin: Point } | null>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [minimap, setMinimap] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; position: Point; nodeId?: string } | null>(null);
  const initialFit = useRef("");
  const columns = Math.min(3, Math.max(1, menu.options.length));
  const baseWidth = Math.max(800, columns * 264 + 64);
  const center = baseWidth / 2;
  const menuHeight = Math.max(142, Math.min(menu.options.length, 6) * 24 + 80);
  const branchY = 330 + menuHeight + 90;
  const defaults: FlowNode[] = [
    { id: `${menu.id}:start`, kind: "start", x: center - 115, y: 30, w: 230, h: 100 },
    { id: `${menu.id}:message`, kind: "message", x: center - 158, y: 150, w: 316, h: 134 },
    { id: `${menu.id}:menu`, kind: "menu", x: center - 158, y: 330, w: 316, h: menuHeight },
    ...menu.options.map((option, i): FlowNode => ({ id: `${menu.id}:${option.id}`, kind: "option", option, x: center - columns * 264 / 2 + (i % columns) * 264 + 12, y: branchY + Math.floor(i / columns) * 260, w: 240, h: 202 })),
    { id: `${menu.id}:return`, kind: "return", x: center - 145, y: branchY + Math.max(1, Math.ceil(menu.options.length / columns)) * 260 + 10, w: 290, h: 58 },
  ];
  const nodes = defaults.map(node => ({ ...node, ...(flow.layout?.[node.id] ?? {}) }));
  const width = Math.max(baseWidth, ...nodes.map(n => n.x + n.w + 40));
  const height = Math.max(860, ...nodes.map(n => n.y + n.h + 50));
  useEffect(() => {
    const element = viewport.current;
    if (!element || disabled) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setContextMenu(null);
      if (!event.deltaY || drag.current || pan.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      const nextZoom = Math.max(0.25, Math.min(1.5, zoom * Math.exp(-delta * 0.002)));
      if (nextZoom === zoom) return;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left + element.scrollLeft;
      const y = event.clientY - rect.top + element.scrollTop;
      const inset = Math.max(0, (element.clientWidth - width * zoom) / 2);
      const nextInset = Math.max(0, (element.clientWidth - width * nextZoom) / 2);
      setOffset({
        x: x - nextInset - ((x - inset - offset.x) / zoom) * nextZoom,
        y: y - ((y - offset.y) / zoom) * nextZoom,
      });
      setZoom(nextZoom);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [disabled, expanded, width, zoom, offset]);
  useEffect(() => {
    if (!contextMenu) return;
    contextMenuElement.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: globalThis.PointerEvent) => {
      if (!contextMenuElement.current?.contains(event.target as Node)) setContextMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(null);
      contextFocus.current?.focus();
    };
    const close = () => setContextMenu(null);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
    };
  }, [contextMenu]);
  useEffect(() => {
    if (!viewport.current) return;
    const fitKey = `${expanded}:${menu.id}`;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || initialFit.current === fitKey) return;
      initialFit.current = fitKey;
      setOffset({ x: 0, y: 0 });
      // Abra com textos legíveis; a visão completa continua disponível em Ajustar.
      setZoom(Math.max(0.6, Math.min(0.85, (rect.width - 32) / width)));
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [width, height, expanded, menu.id]);
  useEffect(() => {
    if (!expanded) {
      if (wasExpanded.current) expandButton.current?.focus();
      wasExpanded.current = false;
      return;
    }
    wasExpanded.current = true;
    dialog.current?.showModal();
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [expanded]);
  const [start, message, options] = nodes;
  const end = nodes[nodes.length - 1];
  function curve(a: FlowNode, b: FlowNode) {
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
    const mid = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
  }
  function select(node: FlowNode) {
    if (expanded && ["message", "menu", "option"].includes(node.kind)) setEditing(true);
    if (node.kind === "option") onSelect({ kind: "option", optionId: node.option!.id });
    else if (node.kind === "message" || node.kind === "menu") onSelect({ kind: node.kind });
  }
  function moveNode(event: PointerEvent<HTMLDivElement>, node: FlowNode) {
    if (!drag.current || drag.current.id !== node.id) return;
    const dx = (event.clientX - drag.current.pointer.x) / zoom, dy = (event.clientY - drag.current.pointer.y) / zoom;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !drag.current.moved) return;
    drag.current.moved = true;
    onLayout({ ...flow.layout, [node.id]: { x: Math.max(12, Math.min(10000, drag.current.origin.x + dx)), y: Math.max(12, Math.min(10000, drag.current.origin.y + dy)) } });
  }
  function fit() {
    setOffset({ x: 0, y: 0 });
    if (viewport.current) { setZoom(Math.max(0.25, Math.min(1, (viewport.current.clientWidth - 32) / width, (viewport.current.clientHeight - 50) / height))); viewport.current.scrollTo({ left: 0, top: 0, behavior: "smooth" }); }
  }
  function closeExpanded() {
    setContextMenu(null);
    setExpanded(false);
    setEditing(false);
  }
  const contextNode = nodes.find(node => node.id === contextMenu?.nodeId);
  const contextOption = contextNode?.option;
  const contextSubmenu = contextOption?.action === "SUBMENU" ? flow.menus.find(item => item.id === contextOption.targetMenuId) : undefined;
  function contextAction(action: () => void) {
    setContextMenu(null);
    action();
  }
  function addFromContext(action: BotOption["action"]) {
    if (!contextMenu) return;
    const position = contextMenu.position;
    contextAction(() => { if (expanded) setEditing(true); onAdd(action, position); });
  }
  const canvas = <section className={styles.canvasPanel} aria-label="Designer de fluxo" inert={disabled}>
    <div className={styles.canvasToolbar}><div><strong>Fluxo do bot</strong><span className={`${styles.badge} ${dirty ? styles.amber : styles.green}`}>{dirty ? "Não salvo" : "Salvo"}</span></div><div className={styles.canvasTools}>
      {onOverview && <select className={`${styles.toolButton} ${styles.flowMode}`} aria-label="Modo de visualização" value="menu" onChange={event => { if (event.target.value === "overview") onOverview(); }}><option value="menu">Padrão</option><option value="overview">Modo 2 · n8n</option></select>}
      <div className={styles.zoom}><button aria-label="Diminuir zoom" onClick={() => setZoom(z => Math.max(0.25, z - 0.1))}><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Aumentar zoom" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}><Plus size={14} /></button></div>
      <button className={styles.toolButton} title="Exibir os blocos no tamanho original" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>100%</button>
      <button className={styles.toolButton} onClick={fit} title="Ajustar todo o fluxo à tela"><Maximize2 size={13} /><span>Ajustar</span></button>
      {!expanded && <button ref={expandButton} className={styles.toolButton} onClick={() => setExpanded(true)} aria-haspopup="dialog"><Maximize2 size={13} /><span>Tela cheia</span></button>}
      <button className={styles.toolButton} aria-pressed={minimap} onClick={() => setMinimap(!minimap)}>Minimapa</button>
      {expanded && <select className={styles.toolButton} aria-label="Menu do fluxo" value={menu.id} onChange={e => onOpenMenu(e.target.value)}>{flow.menus.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      {expanded && <button className={styles.toolButton} aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? "Ocultar edição" : "Editar nó"}</button>}
      {expanded && <button ref={closeButton} className={styles.toolButton} onClick={closeExpanded} aria-label="Fechar visualização do fluxo" title="Fechar (Esc)"><X size={15} /><span>Fechar</span></button>}
    </div></div>
    <div ref={viewport} tabIndex={-1} data-flow-viewport className={styles.canvasViewport} onContextMenu={e => {
      e.preventDefault();
      const nodeElement = (e.target as HTMLElement).closest<HTMLElement>("[data-flow-node]");
      const node = nodes.find(item => item.id === nodeElement?.dataset.flowNode);
      contextFocus.current = nodeElement ?? e.currentTarget;
      if (node?.kind === "option") onSelect({ kind: "option", optionId: node.option!.id });
      else if (node?.kind === "menu" || node?.kind === "message") onSelect({ kind: node.kind });
      const rect = e.currentTarget.getBoundingClientRect();
      const panel = e.currentTarget.parentElement!.getBoundingClientRect();
      const inset = Math.max(0, (e.currentTarget.clientWidth - width * zoom) / 2);
      setContextMenu({
        x: Math.max(8, Math.min(e.clientX - panel.left, panel.width - 244)),
        y: Math.max(8, Math.min(e.clientY - panel.top, panel.height - 340)),
        position: { x: Math.max(12, Math.min(10000, (e.clientX - rect.left - inset + e.currentTarget.scrollLeft - offset.x) / zoom)), y: Math.max(12, Math.min(10000, (e.clientY - rect.top + e.currentTarget.scrollTop - offset.y) / zoom)) },
        ...(node ? { nodeId: node.id } : {}),
      });
    }} onDragOver={e => { if (e.dataTransfer.types.includes("application/cotrimbot-action")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }} onDrop={e => { e.preventDefault(); const action = e.dataTransfer.getData("application/cotrimbot-action"); const rect = e.currentTarget.getBoundingClientRect(); const inset = Math.max(0, (e.currentTarget.clientWidth - width * zoom) / 2); if (["MESSAGE", "SUBMENU", "HUMAN", "IMAGE", "CLOSE", "SAC_TEST"].includes(action)) onAdd(action as BotOption["action"], { x: Math.max(12, Math.min(10000, (e.clientX - rect.left - inset + e.currentTarget.scrollLeft - offset.x) / zoom)), y: Math.max(12, Math.min(10000, (e.clientY - rect.top + e.currentTarget.scrollTop - offset.y) / zoom)) }); }}
      onPointerDown={e => { if (e.button !== 0 || !e.isPrimary || (e.target as HTMLElement).closest("[data-flow-node]")) return; e.preventDefault(); pan.current = { pointer: { x: e.clientX, y: e.clientY }, origin: offset }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (pan.current) setOffset({ x: pan.current.origin.x + e.clientX - pan.current.pointer.x, y: pan.current.origin.y + e.clientY - pan.current.pointer.y }); }} onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }} onLostPointerCapture={() => { pan.current = null; }}>
      <div style={{ width: width * zoom, height: height * zoom, marginInline: "auto" }}><div className={styles.stage} style={{ width, height, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
        <svg className={styles.edges} width={width} height={height} aria-hidden="true"><defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--flow-line)" strokeWidth="1.3" /></marker></defs>
          <motion.path d={curve(start, message)} style={{ stroke: accents.green }} initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} /><motion.path d={curve(message, options)} style={{ stroke: accents.cyan }} initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
          {nodes.filter(n => n.option).map(n => <g key={n.id}><motion.path d={curve(options, n)} style={{ stroke: accents[nodeTone(n)], opacity: n.option!.active ? 0.8 : 0.25 }} initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45 }} />{["MESSAGE", "IMAGE"].includes(n.option!.action) && <path d={curve(n, end)} className={styles.returnEdge} />}<rect x={n.x + n.w / 2 - 18} y={n.y - 38} width="36" height="26" rx="8" fill="var(--flow-label)" stroke={accents[nodeTone(n)]} /><text x={n.x + n.w / 2} y={n.y - 20} textAnchor="middle" fill={accents[nodeTone(n)]} fontSize="13">{n.option!.number}</text></g>)}
        </svg>
        {nodes.map(node => {
          const active = node.kind === selection.kind && (node.kind !== "option" || node.option?.id === selection.optionId);
          const tone = nodeTone(node);
          const Icon = node.kind === "start" ? Play : node.kind === "return" ? CornerDownLeft : node.kind === "menu" ? ListTree : node.option?.action === "HUMAN" ? UserRound : node.option?.action === "SUBMENU" ? GitBranch : node.option?.action === "IMAGE" ? ImagePlus : node.option?.action === "CLOSE" ? SquareCheck : MessageSquare;
          const title = node.kind === "start" ? "Início" : node.kind === "return" ? "Voltar ao menu anterior" : node.kind === "menu" ? "Menu de opções" : node.option?.action === "HUMAN" ? "Atendimento humano" : node.option?.action === "SUBMENU" ? "Ir para outro menu" : node.option?.action === "IMAGE" ? "Enviar imagem" : node.option?.action === "CLOSE" ? "Encerrar atendimento" : node.option?.action === "SAC_TEST" ? "Abrir chamado (teste)" : "Mensagem";
          return <motion.div key={node.id} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: node.option && !node.option.active ? 0.5 : 1 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} data-flow-node={node.id} role="button" tabIndex={0} aria-label={node.option ? `Editar opção ${node.option.number}: ${node.option.label}` : `Editar ${title}`} aria-pressed={active} className={`${styles.node} ${styles[`node_${tone}`]} ${node.option ? styles.optionCard : ''} ${active ? styles.nodeSelected : ""} ${activeMenuId === menu.id && (activeOptionId ? node.option?.id === activeOptionId : node.kind === "menu") ? styles.nodeStepActive : ""} ${node.option && !node.option.active ? styles.nodeInactive : ""}`} style={{ left: node.x, top: node.y, width: node.w, height: node.h }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(node); } }}
            onPointerDown={e => { if (e.button !== 0 || !e.isPrimary || (e.target as HTMLElement).closest("button")) return; e.stopPropagation(); select(node); drag.current = { id: node.id, pointer: { x: e.clientX, y: e.clientY }, origin: { x: node.x, y: node.y }, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={e => moveNode(e, node)} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            <div className={styles.nodeHeading}><span className={`${styles.nodeIcon} ${styles[tone]}`}><Icon size={17} /></span><strong>{node.option?.label || (node.kind === "menu" || node.kind === "message" ? menu.name : title)}</strong><GripHorizontal size={14} className={styles.nodeGrip} /></div>
            {node.kind === "start" && <p>Quando o cliente envia uma mensagem</p>}
            {node.kind === "message" && <p className={styles.nodeText}>{menu.imageId && <span><ImagePlus size={13} /> Imagem configurada<br /></span>}{menu.text || (menu.imageId ? "Legenda opcional" : "Clique para escrever a mensagem inicial…")}</p>}
            {node.kind === "menu" && <><ul className={styles.nodeOptions}>{menu.options.slice(0, 6).map(o => <li key={o.id} className={!o.active ? styles.muted : ""}><i />{o.number} — {o.label}</li>)}</ul>{!menu.options.length && <p>Adicione uma opção para começar.</p>}{menu.options.length > 6 && <p>+ {menu.options.length - 6} opções</p>}<footer>Aguarda a resposta do cliente…</footer></>}
            {node.option && <><p className={styles.optionTitle}>{title}</p>{node.option.description && <p className={styles.nodeText}>{node.option.description}</p>}<p className={styles.nodeText}>{node.option.action === "SUBMENU" ? `Menu: ${flow.menus.find(m => m.id === node.option!.targetMenuId)?.name ?? "Selecione um destino"}` : node.option.action === "SAC_TEST" ? "Coleta de dados, revisão e gravação de teste. Sem integração com o SAC." : node.option.response || "Resposta ainda não configurada"}</p><footer>{node.option.action === "SAC_TEST" ? "0 — Solicitar cancelamento durante a coleta" : node.option.action === "SUBMENU" ? flow.menus.some(item => item.id === node.option!.targetMenuId) ? <button onClick={() => onOpenMenu(node.option!.targetMenuId)}>Abrir submenu <ArrowRight size={14} /></button> : <button onClick={() => { if (expanded) setEditing(true); onCreateSubmenu(node.option!.id); }}>Criar menu de opções <Plus size={14} /></button> : node.option.action === "CLOSE" ? "Atendimento encerrado" : node.option.action === "HUMAN" ? "Automação pausada após a transferência" : <><CornerDownLeft size={13} /> 0 — {flow.backLabel}</>}</footer></>}
          </motion.div>;
        })}
      </div></div>
    </div>
    {contextMenu && <div ref={contextMenuElement} role="menu" aria-label="Opções do fluxo" className={styles.contextMenu} style={{ left: contextMenu.x, top: contextMenu.y }} onKeyDown={event => {
      if (event.key === "Tab") { setContextMenu(null); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      {contextNode && ["message", "menu", "option"].includes(contextNode.kind) && <button role="menuitem" onClick={() => contextAction(() => select(contextNode))}><MessageSquare size={14} /> Editar nó</button>}
      {contextOption && <button role="menuitem" disabled={!contextSubmenu && flow.menus.length >= 50} onClick={() => contextAction(() => {
        if (expanded) setEditing(true);
        if (contextSubmenu) onOpenMenu(contextSubmenu.id);
        else onCreateSubmenu(contextOption.id);
      })}><ListTree size={14} /> {contextSubmenu ? "Abrir menu de opções" : "Menu de opções"}</button>}
      {contextOption && <button role="menuitem" onClick={() => contextAction(() => { closeExpanded(); onTestOption(contextOption.number); })}><Play size={14} /> Testar esta opção</button>}
      <button role="menuitem" disabled={menu.options.length >= 50} onClick={() => addFromContext("CLOSE")}><SquareCheck size={14} /> Encerrar atendimento</button>
      <button role="menuitem" disabled={menu.options.length >= 50} onClick={() => addFromContext("MESSAGE")}><MessageSquare size={14} /> Adicionar mensagem</button>
      <button role="menuitem" disabled={menu.options.length >= 50} onClick={() => addFromContext("IMAGE")}><ImagePlus size={14} /> Adicionar imagem</button>
      {!contextNode?.option && <button role="menuitem" disabled={menu.options.length >= 50} onClick={() => addFromContext("SUBMENU")}><ListTree size={14} /> Adicionar submenu</button>}
      <button role="menuitem" disabled={menu.options.length >= 50} onClick={() => addFromContext("HUMAN")}><UserRound size={14} /> Transferir para humano</button>
      <div role="separator" />
      <button role="menuitem" onClick={() => contextAction(fit)}><Maximize2 size={14} /> Ajustar à tela</button>
      <button role="menuitem" onClick={() => contextAction(() => setMinimap(!minimap))}><ListTree size={14} /> {minimap ? "Ocultar minimapa" : "Mostrar minimapa"}</button>
    </div>}
    <div className={styles.canvasHint}><GripHorizontal size={13} /> Role para dar zoom · arraste o fundo para navegar{expanded ? " · Esc para fechar" : ""}</div>
    <AnimatePresence>{minimap && <motion.button initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }} transition={{ duration: 0.15 }} className={styles.minimap} aria-label="Navegar pelo minimapa" onClick={e => { setOffset({ x: 0, y: 0 }); const rect = e.currentTarget.getBoundingClientRect(); viewport.current?.scrollTo({ left: ((e.clientX - rect.left) / rect.width) * width * zoom - viewport.current.clientWidth / 2, top: ((e.clientY - rect.top) / rect.height) * height * zoom - viewport.current.clientHeight / 2, behavior: "smooth" }); }}><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">{nodes.map(n => <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} rx="12" fill={accents[nodeTone(n)]} fillOpacity={0.65} />)}</svg></motion.button>}</AnimatePresence>
    <button className={styles.addFloating} onClick={() => { if (expanded) setEditing(true); onAdd("MESSAGE"); }}><Plus size={14} /> Adicionar opção</button>
  </section>;
  return expanded ? <dialog ref={dialog} className={styles.flowDialog} aria-label="Visualização ampliada do fluxo" onCancel={closeExpanded}>{canvas}<fieldset disabled={disabled} className={styles.expandedEditor} hidden={!editing}><div ref={onEditorHost} className={styles.expandedEditorContent} /></fieldset></dialog> : canvas;
}
