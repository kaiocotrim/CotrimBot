"use client";

import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowUp, BatteryFull, Bot as BotIcon, ChevronDown, ChevronRight, CheckCheck, Copy, GitBranch, Info, ImagePlus, ListTree, LoaderCircle, MessageSquare, Play, Plus, RotateCcw, Save, Send, Settings2, Signal, Smile, SquareCheck, Trash2, UserRound, Wifi, Workflow, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { MessageText } from "@/components/chat/message-text";
import { botImageUrl, botRequest, emptyFlow, type Bot, type BotFlow, type BotList, type BotMenu, type BotOption, type Simulation } from "@/lib/bot-api";
import { IPhonePreview } from "./iphone-preview";
import { BotWorkspace } from "./bot-workspace";
import { BotDisclosure } from "./bot-disclosure";
import { BotEditorPanel } from "./bot-editor-panel";
import { BotSelect } from "./bot-select";
import { BotMessageField } from "./bot-message-field";
import { BotImageInput } from "./bot-image-input";
import { MenuDetailsDialog } from "./menu-details-dialog";
import { MenuNameDialog } from "./menu-name-dialog";
import { MenuTree } from "./menu-tree";
import { FlowCanvas, type NodeSelection } from "./flow-canvas";
import { BotSettingsPanel } from "./bot-settings";
import { BotIntegrationsPanel } from './bot-integrations';
import { BotGraphCanvas } from './bot-graph-canvas';
import { connectBotOption } from '@/lib/bot-graph';
import styles from "./bot-designer.module.css";

type FlowSnapshot = { flow: BotFlow; menuId: string; selection: NodeSelection; showEditor: boolean };

const MotionLink = motion.create(Link);

const components = [
  { action: "SAC_TEST", title: "Abrir chamado (teste)", description: "Coleta dados e salva um chamado de teste", icon: Workflow, tone: "teal" },
  { action: "MESSAGE", title: "Mensagem", description: "Envia texto com imagem opcional", icon: MessageSquare, tone: "blue" },
  { action: "IMAGE", title: "Enviar imagem", description: "Envia uma foto com legenda opcional", icon: ImagePlus, tone: "blue" },
  { action: "HUMAN", title: "Transferir para humano", description: "Encaminha para atendimento", icon: UserRound, tone: "amber" },
  { action: "CLOSE", title: "Encerrar atendimento", description: "Finaliza a sessão do bot", icon: SquareCheck, tone: "red" },
  { action: "SUBMENU", title: "Ir para outro menu", description: "Conecta a um submenu do fluxo", icon: GitBranch, tone: "purple" },
] as const;

export default function BotDesigner() {
  const reduceMotion = useReducedMotion();
  const tabHighlightId = useId();
  const entrance = {
    initial: reduceMotion ? false as const : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] as const },
  };
  const controlMotion = { whileHover: reduceMotion ? undefined : { y: -1 }, whileTap: reduceMotion ? undefined : { scale: .97 }, transition: { duration: reduceMotion ? 0 : .18 } };
  const labelMotion = { initial: reduceMotion ? false as const : { opacity: 0, y: 3 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: reduceMotion ? 0 : -3 }, transition: { duration: reduceMotion ? 0 : .16 } };
  const { data: session, isPending } = useSession();
  const [list, setList] = useState<BotList>({ bots: [], activeBotId: null, instanceAvailable: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("Novo bot");
  const [flow, setFlow] = useState<BotFlow>(emptyFlow);
  const [menuId, setMenuId] = useState("root");
  const [previewMenuId, setPreviewMenuId] = useState<string | null>(null);
  const [namingMenu, setNamingMenu] = useState<{ mode: "create"; parentOption?: BotOption } | { mode: "rename"; id: string } | null>(null);
  const [selection, setSelection] = useState<NodeSelection>({ kind: "message" });
  const [tab, setTab] = useState<"flow" | "settings" | "integrations">("flow");
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [inputs, setInputs] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [simulationTimes, setSimulationTimes] = useState<string[]>([]);
  const [showTestEmojis, setShowTestEmojis] = useState(false);
  const [showTestOptions, setShowTestOptions] = useState(true);
  const testInput = useRef<HTMLInputElement>(null);
  const [showTest, setShowTest] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const undoHistory = useRef<FlowSnapshot[]>([]);
  const redoHistory = useRef<FlowSnapshot[]>([]);
  const historyGroup = useRef<{ key: string; at: number } | null>(null);
  const [canvasMode, setCanvasMode] = useState<'overview' | 'menu'>('menu');
  const [showComponents, setShowComponents] = useState(true);
  const [showMenus, setShowMenus] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cotrimbot-flow-mode');
      if (saved === 'overview' || saved === 'menu') setCanvasMode(saved);
      setShowComponents(localStorage.getItem('cotrimbot-sidebar-components') !== 'false');
      setShowMenus(localStorage.getItem('cotrimbot-sidebar-menus') !== 'false');
    } catch {}
  }, []);
  function changeCanvasMode(next: 'overview' | 'menu') { setCanvasMode(next); try { localStorage.setItem('cotrimbot-flow-mode', next); } catch {} }
  function changeSidebarCard(card: 'components' | 'menus', open: boolean) {
    if (card === 'components') setShowComponents(open); else setShowMenus(open);
    try { localStorage.setItem(`cotrimbot-sidebar-${card}`, String(open)); } catch {}
  }
  const [testStartMenuId, setTestStartMenuId] = useState<string | undefined>(undefined);
  const [testTab, setTestTab] = useState<"test" | "history">("test");
  const inspector = useRef<HTMLElement>(null);
  const setInspector = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    inspector.current = node;
    return () => { if (inspector.current === node) inspector.current = null; };
  }, []);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const tester = useRef<HTMLElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const latestImageMessage = useRef<HTMLDivElement>(null);
  const bot = list.bots.find(b => b.id === selected);
  const menu = flow.menus.find(m => m.id === menuId) ?? flow.menus[0];
  const option = selection.kind === "option" ? menu?.options.find(o => o.id === selection.optionId) : undefined;
  const paths = new Map<string, string>();
  function walk(id: string, parent: string) {
    if (paths.has(id)) return;
    const item = flow.menus.find(m => m.id === id);
    if (!item) return;
    const path = parent ? `${parent} › ${item.name}` : item.name;
    paths.set(id, path);
    item.options.filter(o => o.action === "SUBMENU").forEach(o => walk(o.targetMenuId, path));
  }
  walk(flow.rootMenuId, "");
  const publishedDiffers = Boolean(bot?.published && (dirty || JSON.stringify(flow) !== JSON.stringify(bot.published)));
  const simulationEnded = Boolean(simulation && simulation.state.status !== "BOT_ACTIVE");
  const currentTestOption = simulation?.steps?.at(-1)?.optionId ?? simulation?.messages.filter(message => message.role === "bot").at(-1)?.optionId;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    botRequest<BotList>().then(data => {
      if (cancelled) return;
      undoHistory.current = []; redoHistory.current = []; historyGroup.current = null;
      setList(data);
      const first = data.bots.find(b => b.id === data.activeBotId) ?? data.bots[0];
      if (first) { setSelected(first.id); setName(first.name); setFlow(structuredClone(first.draft)); setMenuId(first.draft.rootMenuId); }
    }).catch(error => { if (!cancelled) setNotice(error.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!showTest) return;
    if (latestImageMessage.current) latestImageMessage.current.scrollIntoView({ block: "start", behavior: "smooth" });
    else messagesEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [simulation, testTab, showTest]);

  useEffect(() => {
    const handleHistory = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.ctrlKey && !event.metaKey) || event.altKey || event.repeat || busy || uploadingImage || loading || isPending || !session) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [contenteditable="true"]'))) return;
      const redo = key === "y" || event.shiftKey;
      const source = redo ? redoHistory.current : undoHistory.current;
      const destination = redo ? undoHistory.current : redoHistory.current;
      let snapshot = source.pop();
      while (snapshot && (snapshot.flow === flow || JSON.stringify(snapshot.flow) === JSON.stringify(flow))) snapshot = source.pop();
      if (!snapshot) return;
      event.preventDefault();
      destination.push({ flow, menuId, selection, showEditor });
      historyGroup.current = null;
      setFlow(snapshot.flow);
      setMenuId(snapshot.menuId);
      setSelection(snapshot.selection);
      setShowEditor(snapshot.showEditor);
      setDirty(true);
      setSimulation(null); setInputs([]); setNotice("");
      requestAnimationFrame(() => {
        const nodeId = canvasMode === "overview"
          ? `graph:${snapshot.menuId}:${snapshot.selection.kind === "option" ? snapshot.selection.optionId : "menu"}`
          : `${snapshot.menuId}:${snapshot.selection.kind === "option" ? snapshot.selection.optionId : snapshot.selection.kind}`;
        document.querySelector<HTMLElement>(`[data-${canvasMode === "overview" ? "graph" : "flow"}-node="${CSS.escape(nodeId)}"]`)?.focus({ preventScroll: true });
      });
    };
    document.addEventListener("keydown", handleHistory);
    return () => document.removeEventListener("keydown", handleHistory);
  }, [flow, menuId, selection, showEditor, canvasMode, busy, uploadingImage, loading, isPending, session]);

  function selectNode(next: NodeSelection) {
    setSelection(next);
    setShowEditor(true);
    if (!editorHost && window.innerWidth < 1100) requestAnimationFrame(() => inspector.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  function change(next: BotFlow, group?: string) {
    if (next === flow) return;
    const now = performance.now();
    if (!group || historyGroup.current?.key !== group || now - historyGroup.current.at > 750) {
      undoHistory.current.push({ flow, menuId, selection, showEditor });
      if (undoHistory.current.length > 50) undoHistory.current.shift();
    }
    historyGroup.current = group ? { key: group, at: now } : null;
    redoHistory.current = [];
    setFlow(next); setDirty(true); setSimulation(null); setInputs([]);
  }
  function editMenu(patch: Partial<BotMenu>, group?: string) {
    change({ ...flow, menus: flow.menus.map(m => m.id === menu?.id ? { ...m, ...patch } : m) }, group ?? (patch.options ? undefined : `menu:${menu?.id}:${Object.keys(patch).join(",")}`));
  }
  function editOption(patch: Partial<BotOption>) {
    if (menu) editMenu({ options: menu.options.map(o => o.id === selection.optionId ? { ...o, ...patch } : o) }, `option:${menu.id}:${selection.optionId}:${Object.keys(patch).join(",")}`);
  }
  function openMenu(id: string) { if (flow.menus.some(m => m.id === id)) { setMenuId(id); setSelection({ kind: "message" }); } }
  function editPreviewMenu(id: string, optionId?: string) {
    setPreviewMenuId(null);
    setTab("flow");
    openMenu(id); setShowEditor(true);
    if (optionId) setSelection({ kind: "option", optionId });
    requestAnimationFrame(() => inspector.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  function addMenu(parentOption?: BotOption) {
    if (flow.menus.length >= 50) return;
    setNamingMenu({ mode: "create", parentOption });
  }
  function confirmMenuName(name: string) {
    if (!namingMenu || !name.trim()) return;
    if (namingMenu.mode === "rename") {
      change({ ...flow, menus: flow.menus.map(item => item.id === namingMenu.id ? { ...item, name: name.trim() } : item) });
      setNamingMenu(null);
      return;
    }
    if (flow.menus.length >= 50) return;
    const parentOption = namingMenu.parentOption;
    const id = crypto.randomUUID();
    const submenu: BotMenu = { id, name: name.trim(), text: parentOption?.response ?? "", options: [], ...(parentOption?.imageId ? { imageId: parentOption.imageId } : {}) };
    const menus = flow.menus.map(item => item.id === menu.id && parentOption
      ? { ...item, options: item.options.map(itemOption => itemOption.id === parentOption.id ? { ...itemOption, action: "SUBMENU" as const, targetMenuId: id } : itemOption) }
      : item);
    change({ ...flow, menus: [...menus, submenu] }); setMenuId(id); selectNode({ kind: "message" });
    setNamingMenu(null);
  }
  function addOption(action: BotOption["action"] = "MESSAGE", copy?: BotOption, position?: { x: number; y: number }) {
    if (!menu || menu.options.length >= 50) return;
    let number = 1; while (menu.options.some(o => o.number === String(number))) number++;
    const next: BotOption = { id: crypto.randomUUID(), number: String(number), label: action === "SAC_TEST" ? "🎫 Abrir chamado (teste)" : action === "HUMAN" ? "Falar com atendente" : action === "CLOSE" ? "Encerrar atendimento" : action === "SUBMENU" ? "Abrir submenu" : "Nova opção", active: true, action, response: action === "HUMAN" ? "Vou encaminhar sua solicitação para a equipe de atendimento. Aguarde o retorno de um atendente." : action === "CLOSE" ? "Atendimento encerrado. Obrigado pelo contato!" : "", targetMenuId: "", ...copy };
    next.id = crypto.randomUUID(); next.number = String(number);
    change({ ...flow, menus: flow.menus.map(m => m.id === menu.id ? { ...m, options: [...m.options, next] } : m), ...(position ? { layout: { ...flow.layout, [canvasMode === "overview" ? `graph:${menu.id}:${next.id}` : `${menu.id}:${next.id}`]: position } } : {}) }); selectNode({ kind: "option", optionId: next.id });
  }
  function move(index: number, delta: number) {
    if (!menu || index + delta < 0 || index + delta >= menu.options.length) return;
    const options = [...menu.options]; [options[index], options[index + delta]] = [options[index + delta], options[index]]; editMenu({ options });
  }
  async function work(action: () => Promise<void>) {
    setBusy(true); setNotice("");
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "Falha na operação."); } finally { setBusy(false); }
  }
  async function save(nextFlow = flow) {
    if (!name.trim()) throw new Error("Informe o nome do bot.");
    for (const m of nextFlow.menus) {
      if (!m.name.trim()) throw new Error("Dê um nome a cada fluxo antes de salvar.");
      const numbers = new Set<string>();
      for (const o of m.options) {
        if (!/^[1-9]\d{0,2}$/.test(o.number) || numbers.has(o.number)) throw new Error(`Revise a numeração do menu ${m.name}: use números únicos de 1 a 999.`);
        numbers.add(o.number);
      }
    }
    const saved = await botRequest<Bot>(selected ? `/${selected}` : "", { name, draft: nextFlow, revision: bot?.revision }, selected ? "PUT" : "POST");
    setList(previous => ({ ...previous, bots: [saved, ...previous.bots.filter(b => b.id !== saved.id)] }));
    setSelected(saved.id); setFlow(nextFlow); setDirty(false); setNotice("Rascunho salvo. A versão publicada permanece em produção.");
    return saved;
  }
  async function publish() {
    const incomplete = flow.menus.find(item => !item.text.trim() && !item.imageId);
    if (incomplete) {
      setTab("flow");
      openMenu(incomplete.id);
      requestAnimationFrame(() => inspector.current?.querySelector("textarea")?.focus());
      const path = paths.get(incomplete.id) ?? `Sem conexão › ${incomplete.name}`;
      throw new Error(`Preencha a mensagem do menu "${path}". Se não for usar esse menu, exclua-o pelo ícone de lixeira.`);
    }
    const saved = await save();
    const published = await botRequest<Bot>(`/${saved.id}/publish`, { revision: saved.revision });
    setList(previous => ({ ...previous, bots: previous.bots.map(item => item.id === published.id ? published : item) }));
    setNotice("Bot publicado e disponível para o Inforbot.");
  }
  async function simulate(nextInputs: string[], startMenuId = testStartMenuId) {
    const result = await botRequest<Simulation>("/simulate", { flow, inputs: nextInputs, ...(startMenuId ? { startMenuId } : {}) });
    const now = new Date().toISOString();
    setSimulationTimes(previous => result.messages.map((_, index) => simulation && nextInputs.length > inputs.length ? previous[index] ?? now : now));
    setInputs(nextInputs); setSimulation(result); setInput(""); setShowTestEmojis(false);
    setMenuId(result.state.menuId);
  }
  function startTest(startMenuId?: string, testOptionNumber?: string) {
    setShowTest(true); setTestTab("test"); setTab("flow"); setShowTestOptions(true); setShowTestEmojis(false);
    setTestStartMenuId(startMenuId ?? flow.rootMenuId);
    void work(() => simulate(testOptionNumber ? [testOptionNumber] : [], startMenuId ?? flow.rootMenuId));
    if (window.innerWidth < 700) requestAnimationFrame(() => tester.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  function removeMenu(targetMenuId = menu?.id) {
    if (busy || uploadingImage || !targetMenuId || targetMenuId === flow.rootMenuId || !flow.menus.some(item => item.id === targetMenuId)) return;
    if (flow.menus.some(m => m.options.some(o => o.action === "SUBMENU" && o.targetMenuId === targetMenuId))) { setNotice("Remova as opções que apontam para este menu antes de excluí-lo."); return; }
    const layout = Object.fromEntries(Object.entries(flow.layout ?? {}).filter(([key]) => !key.startsWith(`${targetMenuId}:`) && !key.startsWith(`graph:${targetMenuId}:`)));
    change({ ...flow, layout, menus: flow.menus.filter(m => m.id !== targetMenuId) }); openMenu(flow.rootMenuId);
  }
  function removeOption(targetOptionId = option?.id, ownerMenuId = menu?.id) {
    if (busy || uploadingImage || !targetOptionId || !ownerMenuId || !flow.menus.some(item => item.id === ownerMenuId && item.options.some(itemOption => itemOption.id === targetOptionId))) return;
    const layout = { ...flow.layout };
    delete layout[`${ownerMenuId}:${targetOptionId}`];
    delete layout[`graph:${ownerMenuId}:${targetOptionId}`];
    change({ ...flow, layout, menus: flow.menus.map(m => m.id === ownerMenuId ? { ...m, options: m.options.filter(o => o.id !== targetOptionId) } : m) });
    setSelection({ kind: "menu" });
  }
  function removeNode(ownerMenuId: string, targetOptionId?: string) {
    if (targetOptionId) removeOption(targetOptionId, ownerMenuId);
    else removeMenu(ownerMenuId);
  }
  if (isPending) return <main className={`${styles.root} p-8`}>Carregando sessão…</main>;
  if (!session) return <main className={`${styles.root} p-8`}><Link href="/login">Entre para acessar a Central de Bots.</Link></main>;

  const editor = <section ref={setInspector} className={styles.inspector} aria-label="Editar nó">
          <div className={styles.inspectorHeader}><h2>Editar nó</h2></div>
          <div className={styles.nodeType}><span className={`${styles.paletteIcon} ${selection.kind === "menu" ? styles.green : option?.action === "HUMAN" ? styles.red : option?.action === "SUBMENU" ? styles.purple : styles.blue}`}>{selection.kind === "menu" ? <ListTree size={18} /> : option?.action === "HUMAN" ? <UserRound size={18} /> : option?.action === "SUBMENU" ? <GitBranch size={18} /> : option?.action === "IMAGE" ? <ImagePlus size={18} /> : <MessageSquare size={18} />}</span><span><strong>{selection.kind === "menu" ? "Menu de opções" : option?.action === "HUMAN" ? "Transferir para humano" : option?.action === "SUBMENU" ? "Ir para outro menu" : option?.action === "IMAGE" ? "Enviar imagem" : option?.action === "SAC_TEST" ? "Abrir chamado (teste)" : "Mensagem"}</strong><small>{option ? "Configure a ação desta opção" : "Personalize o atendimento"}</small></span></div>
          {option ? <>
            <label>Nome da opção<input className={styles.field} maxLength={200} value={option.label} onChange={e => editOption({ label: e.target.value })} /></label>
            <label>Descrição da opção (opcional)<textarea className={`${styles.field} ${styles.optionDescription}`} maxLength={500} value={option.description ?? ""} placeholder="Explique a escolha em uma frase curta" onChange={e => editOption({ description: e.target.value })} /></label>
            <label>Número da opção<input className={styles.field} inputMode="numeric" pattern="[1-9][0-9]{0,2}" maxLength={3} value={option.number} onChange={e => editOption({ number: e.target.value })} /></label>
            {menu.options.some(o => o.id !== option.id && o.number === option.number) && <p role="alert" className={styles.danger}>Número duplicado neste menu.</p>}
            <label>Tipo de ação<BotSelect label="Tipo de ação" value={option.action} onChange={action => editOption({ action: action as BotOption["action"] })} options={[{ value: "MESSAGE", label: "Enviar mensagem" }, { value: "IMAGE", label: "Enviar imagem" }, { value: "SUBMENU", label: "Abrir submenu" }, { value: "HUMAN", label: "Transferir para atendimento humano" }, { value: "CLOSE", label: "Encerrar atendimento" }, { value: "SAC_TEST", label: "Abrir chamado (teste)" }]} /></label>
            {["MESSAGE", "IMAGE", "CLOSE"].includes(option.action) && <BotImageInput label={option.action === "IMAGE" ? "Imagem da opção" : "Imagem da mensagem (opcional)"} imageId={option.imageId} disabled={busy || uploadingImage} onUploading={setUploadingImage} onChange={imageId => editOption({ imageId })} />}
            {option.action === "SAC_TEST" ? <p className={styles.helper}>Coleta CNPJ, nome, telefone, endereço, e-mail, equipamento e motivo. Permite revisar, corrigir e cancelar. Salva um registro de teste no CotrimBot, sem abrir chamado no SAC. No simulador, não grava registros.</p> : option.action === "SUBMENU" ? <label>Menu de destino<BotSelect label="Menu de destino" value={option.targetMenuId} onChange={targetMenuId => editOption({ targetMenuId })} options={[{ value: "", label: "Selecione…" }, ...flow.menus.map(m => ({ value: m.id, label: m.name + (m.id === flow.rootMenuId ? " — voltar ao início" : m.id === menuId ? " — menu atual" : "") }))]} /><span className={styles.helper}>Para voltar ao início, escolha o menu principal. O comando 0 volta ao menu anterior.</span></label> : <BotMessageField label={option.action === "IMAGE" ? "Legenda (opcional)" : "Conteúdo da resposta"} value={option.response} onChange={response => editOption({ response })} />}
            {option.action !== "SAC_TEST" && (option.action === "SUBMENU" && flow.menus.some(item => item.id === option.targetMenuId) ? <button className={styles.button} onClick={() => openMenu(option.targetMenuId)}><ListTree size={14} /> Editar menu de opções <ChevronRight size={14} /></button> : <><button className={styles.button} disabled={flow.menus.length >= 50} onClick={() => addMenu(option)}><ListTree size={14} /> Criar menu de opções</button><p className={styles.helper}>Ao digitar {option.number}, o cliente recebe as opções desse novo menu.</p></>)}
            <label className={styles.check}><input type="checkbox" checked={option.active} onChange={e => editOption({ active: e.target.checked })} /> Opção ativa</label>
            <div className={styles.editorActions}><button className={styles.button} onClick={() => addOption(option.action, option)}><Copy size={13} /> Duplicar</button><button className={styles.iconButton} aria-label="Mover opção para cima" disabled={menu.options.indexOf(option) === 0} onClick={() => move(menu.options.indexOf(option), -1)}><ArrowUp size={14} /></button><button className={styles.iconButton} aria-label="Mover opção para baixo" disabled={menu.options.indexOf(option) === menu.options.length - 1} onClick={() => move(menu.options.indexOf(option), 1)}><ArrowDown size={14} /></button></div>
          </> : <>
            <label>Nome do bot<input className={styles.field} maxLength={100} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} /></label>
            <label>Nome do menu<input className={styles.field} maxLength={100} value={menu.name} onChange={e => editMenu({ name: e.target.value })} /></label>
            {selection.kind === "message" ? <>
              <BotMessageField label={menu.id === flow.rootMenuId ? "Mensagem inicial" : "Mensagem do submenu"} value={menu.text} placeholder="Olá! Como podemos ajudar?" onChange={text => editMenu({ text })} />
              <BotImageInput label="Imagem do menu (opcional)" imageId={menu.imageId} disabled={busy || uploadingImage} onUploading={setUploadingImage} onChange={imageId => editMenu({ imageId })} />
              <p className={styles.helper}>Quebras de linha, emojis e links são aceitos. As opções são acrescentadas automaticamente ao texto.</p>
              <p className={styles.helper}>Próximo passo</p><button className={styles.button} onClick={() => selectNode({ kind: "menu" })}><ListTree size={14} /> Editar opções <ChevronRight size={14} /></button>
            </> : <><div className={styles.optionList}>{menu.options.map((o, index) => <div className={styles.optionRow} key={o.id}><button onClick={() => selectNode({ kind: "option", optionId: o.id })}>{o.number} — {o.label}</button><button className={styles.iconButton} aria-label={`Mover ${o.label} para cima`} disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={12} /></button><button className={styles.iconButton} aria-label={`Mover ${o.label} para baixo`} disabled={index === menu.options.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12} /></button></div>)}</div><button className={styles.button} onClick={() => addOption()}><Plus size={14} /> Adicionar opção</button><p className={styles.helper}>0 é reservado para voltar. A ordem dos nós acompanha a ordem das opções; os números são editáveis.</p></>}
          </>}
          <button className={styles.button} onClick={() => startTest(menu.id, option?.number)}><Play size={14} /> {option ? "Testar esta opção" : "Testar este menu"}</button>
          {option?.action === "CLOSE" && <p className={styles.helper}>Envia a despedida e encerra a sessão. A automação permanece parada até a conversa ser devolvida ao bot.</p>}
          {option?.action === "HUMAN" && <p className={styles.helper}>Pausa o bot e libera a conversa para um atendente assumir.</p>}
          {editorHost && notice && <p role="status" className={styles.helper}>{notice}</p>}
          <button className={`${styles.primary} ${styles.saveButton}`} onClick={() => void work(async () => { await save(); })}><Save size={15} /> Salvar rascunho{dirty ? " *" : ""}</button>
          {(option || menu.id !== flow.rootMenuId) && <button type="button" className={`${styles.button} ${styles.deleteButton}`} onClick={() => option ? removeOption() : removeMenu()}><Trash2 size={15} />{option ? "Excluir opção" : "Excluir menu"}</button>}
        </section>;

  return <main className={styles.root}>
    <motion.header {...entrance} className={styles.header}>
      <div className={styles.headerRow}>
        <MotionLink {...controlMotion} href="/" className={styles.back} aria-label="Voltar" title="Voltar"><ArrowLeft size={17} /></MotionLink>
        <motion.div layout="position" transition={{ duration: reduceMotion ? 0 : .22 }} className={styles.headerActions}>
          {selected && <motion.span layout="position" className={`${styles.badge} ${bot?.published && !publishedDiffers ? styles.green : styles.amber}`}><span className={`${styles.dot} ${bot?.published && !publishedDiffers ? styles.live : ""}`} />{publishedDiffers ? "Alterações não publicadas" : bot?.published ? "Publicado" : "Rascunho"}</motion.span>}
          <AnimatePresence initial={false}>
            {tab === "flow" && <motion.div key="flow-controls" className={styles.headerFlowActions}
              initial={reduceMotion ? false : { width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : .22, ease: [.22, 1, .36, 1] }}>
              <motion.button {...controlMotion} className={styles.button} disabled={busy || uploadingImage || loading} aria-label={showTest ? "Fechar teste" : "Testar bot"} aria-expanded={showTest} aria-controls={`${tabHighlightId}-test-panel`} onClick={() => { if (showTest) setShowTest(false); else if (simulation) setShowTest(true); else startTest(); }}>
                <BotIcon size={15} /><span className={styles.headerActionLabel} aria-hidden="true"><AnimatePresence initial={false} mode="popLayout"><motion.span key={String(showTest)} {...labelMotion}>{showTest ? "Fechar teste" : "Testar bot"}</motion.span></AnimatePresence></span>
              </motion.button>
              <motion.button {...controlMotion} className={styles.button} aria-label={showEditor ? "Ocultar edição" : "Editar nó"} aria-pressed={showEditor} onClick={() => setShowEditor(!showEditor)}>
                <Settings2 size={15} /><span className={styles.headerActionLabel} aria-hidden="true"><AnimatePresence initial={false} mode="popLayout"><motion.span key={String(showEditor)} {...labelMotion}>{showEditor ? "Ocultar edição" : "Editar nó"}</motion.span></AnimatePresence></span>
              </motion.button>
            </motion.div>}
          </AnimatePresence>
          <motion.button layout="position" {...controlMotion} className={styles.primary} disabled={busy || uploadingImage || loading || !name.trim()} onClick={() => void work(publish)}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />} Publicar</motion.button>
        </motion.div>
        <div className={styles.tabs} role="tablist" aria-label="Central de Bots">
          {([{ value: "flow", label: "Fluxo", icon: Workflow }, { value: "integrations", label: "Integrações", icon: Workflow }, { value: "settings", label: "Configurações", icon: Settings2 }] as const).map(item => <motion.button key={item.value} role="tab" aria-selected={tab === item.value} className={styles.tab} onClick={() => setTab(item.value)} {...controlMotion}>
            {tab === item.value && <motion.span aria-hidden="true" className={styles.tabHighlight} layoutId={tabHighlightId} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />}
            <item.icon size={14} /><span>{item.label}</span>
          </motion.button>)}
        </div>
      </div>
    </motion.header>
    <AnimatePresence initial={false}>
      {notice && <motion.div key="notice" {...entrance} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} role="status" className={styles.notice}><p>{notice}</p><button aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={14} /></button></motion.div>}
    </AnimatePresence>
    {loading ? <p className="p-8">Carregando bots…</p> : <AnimatePresence mode="wait" initial={false}><BotWorkspace key={tab} disabled={busy || uploadingImage} className={`${styles.workspace} ${tab === "integrations" ? styles.integrationWorkspace : tab === "settings" ? styles.settingsWorkspace : ""} ${tab === "flow" && showEditor && !editorHost ? styles.withEditor : ""}`}>
      {tab === "flow" && <aside className={styles.sidebar}>
        <motion.section {...entrance} className={`${styles.panel} ${styles.palette}`}><button className={styles.paletteHeading} aria-expanded={showComponents} aria-controls={`${tabHighlightId}-components`} onClick={() => changeSidebarCard("components", !showComponents)}><h2>Componentes</h2><motion.span className={styles.disclosureChevron} animate={{ rotate: showComponents ? 0 : -90 }} transition={{ duration: reduceMotion ? 0 : .25 }}><ChevronDown size={14} /></motion.span></button><BotDisclosure open={showComponents} id={`${tabHighlightId}-components`}><div className={styles.paletteBody}><p>Arraste para o fluxo ou clique para adicionar</p><div className={styles.paletteItems}>
          <button className={styles.paletteItem} onClick={() => addMenu(option)} disabled={flow.menus.length >= 50}><span className={`${styles.paletteIcon} ${styles.green}`}><ListTree size={18} /></span><span><strong>Menu de opções</strong><small>{option ? `Cria um submenu para a opção ${option.number}` : "Cria um novo submenu"}</small></span></button>
          {components.map(item => <button key={item.action} className={styles.paletteItem} draggable={!busy} disabled={menu.options.length >= 50} onDragStart={e => { e.dataTransfer.setData("application/cotrimbot-action", item.action); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => addOption(item.action)}><span className={`${styles.paletteIcon} ${styles[item.tone]}`}><item.icon size={18} /></span><span><strong>{item.title}</strong><small>{item.description}</small></span></button>)}
        </div></div></BotDisclosure></motion.section>
        <motion.section {...entrance} transition={{ ...entrance.transition, delay: reduceMotion ? 0 : 0.05 }} className={`${styles.panel} ${styles.menuList}`} aria-label="Menus do fluxo"><button className={styles.paletteHeading} aria-expanded={showMenus} aria-controls={`${tabHighlightId}-menus`} onClick={() => changeSidebarCard("menus", !showMenus)}><h2>Menus do fluxo</h2><motion.span className={styles.disclosureChevron} animate={{ rotate: showMenus ? 0 : -90 }} transition={{ duration: reduceMotion ? 0 : .25 }}><ChevronDown size={14} /></motion.span></button><BotDisclosure open={showMenus} id={`${tabHighlightId}-menus`}><MenuTree flow={flow} currentMenuId={menuId} paths={paths} onPreview={setPreviewMenuId} onRename={id => setNamingMenu({ mode: "rename", id })} /></BotDisclosure></motion.section>
      </aside>}

      {tab === 'integrations' ? <BotIntegrationsPanel key={selected ?? "new"} botName={name} value={flow.integrations} onChange={integrations => change({ ...flow, integrations })} onSave={async integrations => { setBusy(true); try { await save({ ...flow, integrations }); } finally { setBusy(false); } }} /> : tab === "settings" ? <BotSettingsPanel name={name} flow={flow} dirty={dirty} busy={busy} hasBot={Boolean(bot)} active={Boolean(bot && list.activeBotId === bot.id)} canActivate={Boolean(bot?.published && list.instanceAvailable)} instanceAvailable={list.instanceAvailable}
        onNameChange={value => { setName(value); setDirty(true); }} onChange={change}
        onSave={() => void work(async () => { await save(); })}
        onActivate={() => { if (bot) void work(async () => { await botRequest(`/${bot.id}/activation`, { active: list.activeBotId !== bot.id }); setList(await botRequest<BotList>()); setNotice("Status atualizado."); }); }}
      /> : <>
        {canvasMode === 'overview' ? <BotGraphCanvas onDelete={removeNode} flow={flow} dirty={dirty} disabled={busy || uploadingImage} selectedMenuId={menuId} selectedOptionId={option?.id} activeMenuId={showTest ? simulation?.state.menuId : undefined} activeOptionId={currentTestOption} onSelect={(id, optionId) => { openMenu(id); selectNode(optionId ? { kind: 'option', optionId } : { kind: 'message' }); }} onLayout={layout => change({ ...flow, layout }, "layout")} onConnect={(optionId, target) => { try { change(connectBotOption(flow, optionId, target)); const owner = flow.menus.find(item => item.options.some(option => option.id === optionId)); if (owner) { openMenu(owner.id); selectNode({ kind: 'option', optionId }); } } catch (error) { setNotice(error instanceof Error ? error.message : 'Ligação inválida.'); } }} onAdd={(action, position) => addOption(action, undefined, position)} onMenuView={() => changeCanvasMode('menu')} onEditorHost={setEditorHost} /> : <FlowCanvas onDelete={optionId => removeNode(menu.id, optionId)} onOverview={() => changeCanvasMode('overview')} activeMenuId={showTest ? simulation?.state.menuId : undefined} activeOptionId={currentTestOption} onTestOption={(optionNumber) => startTest(menu.id, optionNumber)} onEditorHost={setEditorHost} flow={flow} menu={menu} selection={selection} dirty={dirty} disabled={busy || uploadingImage} onSelect={selectNode} onLayout={layout => change({ ...flow, layout }, "layout")} onAdd={(action, position) => addOption(action, undefined, position)} onOpenMenu={openMenu} onCreateSubmenu={optionId => addMenu(menu.options.find(item => item.id === optionId))} />}
        {editorHost && createPortal(editor, editorHost)}
        <AnimatePresence initial={false}>{!editorHost && showEditor && <BotEditorPanel key="node-editor" onClose={() => setShowEditor(false)}>{editor}</BotEditorPanel>}</AnimatePresence>
        <motion.section ref={tester} id={`${tabHighlightId}-test-panel`} data-bot-test-panel="" className={`${styles.testPanel} ${styles.testVisible}`} aria-label="Simulador do bot" aria-hidden={!showTest} inert={!showTest}
          initial={false}
          animate={showTest
            ? { opacity: 1, x: 0, scale: 1, visibility: "visible" }
            : { opacity: 0, x: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.985, transitionEnd: { visibility: "hidden" } }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32, mass: 0.8, opacity: { duration: 0.22, ease: "easeOut" } }}
          style={{ pointerEvents: showTest ? "auto" : "none", transformOrigin: "right center" }}
          onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setShowTest(false); } }}>

          {simulation && <p className={styles.testLocation}>Você está em: <strong>{simulation.state.sacTest ? `Abertura de chamado (teste) · ${simulation.state.sacTest.step}` : paths.get(simulation.state.menuId) ?? flow.menus.find(item => item.id === simulation.state.menuId)?.name}</strong></p>}
          <div className={styles.testTabs} role="tablist" aria-label="Simulador"><button role="tab" aria-selected={testTab === "test"} onClick={() => setTestTab("test")}>Teste do bot</button><button role="tab" aria-selected={testTab === "history"} onClick={() => setTestTab("history")}>Histórico do teste</button></div>
          {testTab === "history" ? <div className={styles.history}>{simulation?.messages.length ? simulation.messages.map((m, i) => <div className={styles.historyItem} key={i}><strong>{i + 1} · {m.role === "user" ? "Cliente" : "Bot"}</strong>{m.imageId && <Image src={botImageUrl(m.imageId)} alt="Imagem enviada pelo bot" width={280} height={180} unoptimized className={styles.imagePreview} />}{m.text}</div>) : <p className={styles.empty}>Inicie um teste para acompanhar os passos da conversa.</p>}</div> : <IPhonePreview>
            <div className={styles.phoneStatusBar} aria-hidden="true"><span className={styles.phoneClock}>9:41</span><span className={styles.phoneIsland}><span /></span><span className={styles.phoneIndicators}><Signal size={15} strokeWidth={2.2} /><Wifi size={15} strokeWidth={2.2} /><BatteryFull size={21} strokeWidth={1.8} /></span></div>
            <div className={styles.phoneHeader}>
              <button type="button" className={styles.phoneBack} aria-label="Voltar do teste" onClick={() => setShowTest(false)}><ArrowLeft size={20} /></button>
              <span className={styles.phoneAvatar}><BotIcon size={24} aria-hidden="true" /></span>
              <div className={styles.phoneContact}><strong>{name || "Seu assistente"}</strong><small>Ambiente de teste</small></div>
              <button type="button" aria-label="Reiniciar teste" title="Reiniciar teste" onClick={() => void work(() => simulate([]))}><RotateCcw size={18} /></button>
              <button type="button" aria-label="Ver histórico do teste" onClick={() => setTestTab("history")}><Info size={18} /></button>
            </div>
            <div className={styles.messages} aria-live="polite">
              {!simulation ? <div className={styles.testEmpty}><BotIcon size={36} /><p>Experimente seu atendimento.<br />O teste usa o rascunho atual.</p><button className={styles.button} onClick={() => startTest()}><Play size={13} /> Iniciar teste</button></div> : <>
                <div className={styles.phoneDate}><span>Hoje</span></div>
                {simulation.messages.map((m, i) => <motion.div {...entrance} key={i}
                  ref={m.imageId && i === simulation.messages.map(item => Boolean(item.imageId)).lastIndexOf(true) ? latestImageMessage : undefined}
                  className={styles.phoneMessageRow} data-outgoing={m.role === "user"}>
                  <span className={styles.phoneMessageAvatar} aria-hidden="true">{m.role === "user" ? session.user.image ? <Image src={session.user.image} alt="" width={30} height={30} unoptimized /> : <UserRound size={18} /> : <BotIcon size={18} />}</span>
                  <div className={`${styles.bubble} ${m.role === "user" ? styles.bubbleUser : ""}`}>
                    <span className="sr-only">{m.role === "user" ? "Cliente" : "Bot"}: </span>
                    {m.imageId && <Image src={botImageUrl(m.imageId)} alt="Imagem enviada pelo bot" width={280} height={180} unoptimized className={styles.imagePreview} />}
                    <MessageText content={m.text} />
                    <small className={styles.phoneMessageMeta}>{simulationTimes[i] && <time dateTime={simulationTimes[i]}>{new Date(simulationTimes[i]).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</time>}{m.role === "user" && <CheckCheck size={14} aria-hidden="true" />}</small>
                  </div>
                </motion.div>)}
              </>}
              {simulation?.state.status === "WAITING_HUMAN" && <p className={styles.testInfo}>Aguardando atendimento humano. Automação pausada.</p>}<div ref={messagesEnd} />
            </div>
            {simulation?.state.status === "CLOSED" && <p className={styles.testInfo}>Atendimento encerrado. Reinicie o teste para começar novamente.</p>}
            {simulation && !simulationEnded && showTestOptions && <div className={styles.quickReplies}>{(simulation.quickReplies ?? [...(flow.menus.find(m => m.id === simulation.state.menuId)?.options.filter(o => o.active).map(o => o.number) ?? []), "0"]).map(n => <button key={n} onClick={() => void work(() => simulate([...inputs, n]))}>{n}</button>)}</div>}
            {showTestEmojis && <div className={styles.phoneEmojiTray} role="group" aria-label="Emojis do teste">{["😀", "😊", "👍", "❤️", "👋", "✅", "🙏", "🎉"].map(emoji => <button type="button" key={emoji} aria-label={`Inserir ${emoji}`} onClick={() => {
              const start = testInput.current?.selectionStart ?? input.length;
              const end = testInput.current?.selectionEnd ?? input.length;
              const next = input.slice(0, start) + emoji + input.slice(end);
              if (next.length > 8000) return;
              setInput(next);
              requestAnimationFrame(() => { testInput.current?.focus(); testInput.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
            }}>{emoji}</button>)}</div>}
            <form className={styles.composer} onSubmit={e => { e.preventDefault(); if (input.trim() && !simulationEnded) void work(() => simulate([...inputs, input])); }}>
              <button type="button" className={styles.phoneRoundButton} aria-label={showTestOptions ? "Ocultar respostas rápidas" : "Mostrar respostas rápidas"} aria-expanded={showTestOptions} disabled={!simulation || simulationEnded} onClick={() => setShowTestOptions(!showTestOptions)}><Plus size={22} /></button>
              <div className={styles.phoneInputCapsule}>
                <input ref={testInput} aria-label="Mensagem de teste" placeholder="Digite uma mensagem…" value={input} maxLength={8000} onChange={e => setInput(e.target.value)} disabled={!simulation || simulationEnded} onKeyDown={event => { if (event.key === "Escape" && showTestEmojis) { event.preventDefault(); event.stopPropagation(); setShowTestEmojis(false); } }} />
                <button type="button" className={styles.phoneEmojiButton} aria-label="Emojis do teste" aria-expanded={showTestEmojis} disabled={!simulation || simulationEnded} onClick={() => setShowTestEmojis(!showTestEmojis)}><Smile size={20} /></button>
              </div>
              <button type="submit" className={styles.phoneRoundButton} aria-label="Enviar mensagem de teste" disabled={!simulation || !input.trim() || simulationEnded}><Send size={20} /></button>
            </form>
            <div className={styles.phoneHome} aria-hidden="true"><span /></div>
          </IPhonePreview>}
          <p className={styles.testInfo}>Simulação · nenhuma mensagem será enviada ao WhatsApp</p>
        </motion.section>
      </>}
    </BotWorkspace></AnimatePresence>}
    {namingMenu && <MenuNameDialog key={namingMenu.mode === "rename" ? namingMenu.id : "create"} creating={namingMenu.mode === "create"} initialName={namingMenu.mode === "rename" ? flow.menus.find(item => item.id === namingMenu.id)?.name ?? "" : ""} onClose={() => setNamingMenu(null)} onConfirm={confirmMenuName} />}
    <MenuDetailsDialog menu={flow.menus.find(item => item.id === previewMenuId)} flow={flow} path={previewMenuId ? paths.get(previewMenuId) : undefined} onClose={() => setPreviewMenuId(null)} onEdit={editPreviewMenu} onNavigate={setPreviewMenuId} />
  </main>;
}
