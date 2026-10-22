"use client";

import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowUp, Bot as BotIcon, ChevronRight, Copy, GitBranch, ImagePlus, ListTree, LoaderCircle, MessageSquare, Play, Plus, Power, RotateCcw, Save, Send, Settings2, ShieldCheck, Trash2, UserRound, Workflow, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { MessageText } from "@/components/chat/message-text";
import { botImageUrl, botRequest, emptyFlow, type Bot, type BotFlow, type BotList, type BotMenu, type BotOption, type Simulation } from "@/lib/bot-api";
import { BotImageInput } from "./bot-image-input";
import { FlowCanvas, type NodeSelection } from "./flow-canvas";
import styles from "./bot-designer.module.css";

const components = [
  { action: "MESSAGE", title: "Mensagem", description: "Envia texto com imagem opcional", icon: MessageSquare, tone: "blue" },
  { action: "IMAGE", title: "Enviar imagem", description: "Envia uma foto com legenda opcional", icon: ImagePlus, tone: "blue" },
  { action: "HUMAN", title: "Transferir para humano", description: "Encaminha para atendimento", icon: UserRound, tone: "red" },
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
  const { data: session, isPending } = useSession();
  const [list, setList] = useState<BotList>({ bots: [], activeBotId: null, instanceAvailable: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("Novo bot");
  const [flow, setFlow] = useState<BotFlow>(emptyFlow);
  const [menuId, setMenuId] = useState("root");
  const [selection, setSelection] = useState<NodeSelection>({ kind: "message" });
  const [tab, setTab] = useState<"flow" | "settings">("flow");
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [inputs, setInputs] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [testTab, setTestTab] = useState<"test" | "history">("test");
  const inspector = useRef<HTMLElement>(null);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const tester = useRef<HTMLElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    botRequest<BotList>().then(data => {
      if (cancelled) return;
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
  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [simulation]);

  function selectNode(next: NodeSelection) {
    setSelection(next);
    if (!editorHost && window.innerWidth < 1100) requestAnimationFrame(() => inspector.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  function openBot(b?: Bot) {
    if (dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    setSelected(b?.id ?? null); setName(b?.name ?? "Novo bot");
    setFlow(b ? structuredClone(b.draft) : emptyFlow()); setMenuId(b?.draft.rootMenuId ?? "root");
    setSelection({ kind: "message" }); setDirty(false); setSimulation(null); setInputs([]); setTab("flow"); setNotice("");
  }
  function change(next: BotFlow) { setFlow(next); setDirty(true); setSimulation(null); setInputs([]); }
  function editMenu(patch: Partial<BotMenu>) { change({ ...flow, menus: flow.menus.map(m => m.id === menu?.id ? { ...m, ...patch } : m) }); }
  function editOption(patch: Partial<BotOption>) { if (menu) editMenu({ options: menu.options.map(o => o.id === selection.optionId ? { ...o, ...patch } : o) }); }
  function openMenu(id: string) { if (flow.menus.some(m => m.id === id)) { setMenuId(id); setSelection({ kind: "message" }); } }
  function addMenu(parentOption?: BotOption) {
    if (flow.menus.length >= 50) return;
    const id = crypto.randomUUID();
    const submenu: BotMenu = { id, name: parentOption ? `Menu da opção ${parentOption.number}` : "Novo submenu", text: parentOption?.response ?? "", options: [], ...(parentOption?.action === "IMAGE" && parentOption.imageId ? { imageId: parentOption.imageId } : {}) };
    const menus = flow.menus.map(item => item.id === menu.id && parentOption
      ? { ...item, options: item.options.map(itemOption => itemOption.id === parentOption.id ? { ...itemOption, action: "SUBMENU" as const, targetMenuId: id } : itemOption) }
      : item);
    change({ ...flow, menus: [...menus, submenu] }); setMenuId(id); selectNode({ kind: "message" });
  }
  function addOption(action: BotOption["action"] = "MESSAGE", copy?: BotOption, position?: { x: number; y: number }) {
    if (!menu || menu.options.length >= 50) return;
    let number = 1; while (menu.options.some(o => o.number === String(number))) number++;
    const next: BotOption = { id: crypto.randomUUID(), number: String(number), label: action === "HUMAN" ? "Falar com atendente" : action === "SUBMENU" ? "Abrir submenu" : "Nova opção", active: true, action, response: "", targetMenuId: "", ...copy };
    next.id = crypto.randomUUID(); next.number = String(number);
    change({ ...flow, menus: flow.menus.map(m => m.id === menu.id ? { ...m, options: [...m.options, next] } : m), ...(position ? { layout: { ...flow.layout, [`${menu.id}:${next.id}`]: position } } : {}) }); selectNode({ kind: "option", optionId: next.id });
  }
  function move(index: number, delta: number) {
    if (!menu || index + delta < 0 || index + delta >= menu.options.length) return;
    const options = [...menu.options]; [options[index], options[index + delta]] = [options[index + delta], options[index]]; editMenu({ options });
  }
  async function work(action: () => Promise<void>) {
    setBusy(true); setNotice("");
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "Falha na operação."); } finally { setBusy(false); }
  }
  async function save() {
    if (!name.trim()) throw new Error("Informe o nome do bot.");
    for (const m of flow.menus) {
      const numbers = new Set<string>();
      for (const o of m.options) {
        if (!/^[1-9]\d{0,2}$/.test(o.number) || numbers.has(o.number)) throw new Error(`Revise a numeração do menu ${m.name}: use números únicos de 1 a 999.`);
        numbers.add(o.number);
      }
    }
    const saved = await botRequest<Bot>(selected ? `/${selected}` : "", { name, draft: flow, revision: bot?.revision }, selected ? "PUT" : "POST");
    setList(previous => ({ ...previous, bots: [saved, ...previous.bots.filter(b => b.id !== saved.id)] }));
    setSelected(saved.id); setDirty(false); setNotice("Rascunho salvo. A versão publicada permanece em produção.");
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
  async function simulate(nextInputs: string[]) {
    const result = await botRequest<Simulation>("/simulate", { flow, inputs: nextInputs });
    setInputs(nextInputs); setSimulation(result); setInput("");
  }
  function startTest() {
    setShowTest(true); setTestTab("test"); setTab("flow");
    void work(() => simulate([]));
    if (window.innerWidth < 700) requestAnimationFrame(() => tester.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  function removeMenu() {
    if (!menu || menu.id === flow.rootMenuId) return;
    if (flow.menus.some(m => m.options.some(o => o.action === "SUBMENU" && o.targetMenuId === menu.id))) { setNotice("Remova as opções que apontam para este menu antes de excluí-lo."); return; }
    const layout = Object.fromEntries(Object.entries(flow.layout ?? {}).filter(([key]) => !key.startsWith(`${menu.id}:`)));
    change({ ...flow, layout, menus: flow.menus.filter(m => m.id !== menu.id) }); openMenu(flow.rootMenuId);
  }
  function removeOption() {
    if (!option) return;
    const layout = { ...flow.layout }; delete layout[`${menu.id}:${option.id}`];
    change({ ...flow, layout, menus: flow.menus.map(m => m.id === menu.id ? { ...m, options: m.options.filter(o => o.id !== option.id) } : m) });
    setSelection({ kind: "menu" });
  }
  if (isPending) return <main className={`${styles.root} p-8`}>Carregando sessão…</main>;
  if (!session) return <main className={`${styles.root} p-8`}><Link href="/login">Entre para acessar a Central de Bots.</Link></main>;

  const editor = <motion.section ref={inspector} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className={styles.inspector} aria-label="Editar nó">
          <div className={styles.inspectorHeader}><h2>Editar nó</h2>{option ? <button className={`${styles.iconButton} ${styles.danger}`} aria-label="Excluir opção" onClick={removeOption}><Trash2 size={15} /></button> : menu.id !== flow.rootMenuId && <button className={`${styles.iconButton} ${styles.danger}`} aria-label="Excluir menu" onClick={removeMenu}><Trash2 size={15} /></button>}</div>
          <div className={styles.nodeType}><span className={`${styles.paletteIcon} ${selection.kind === "menu" ? styles.green : option?.action === "HUMAN" ? styles.red : option?.action === "SUBMENU" ? styles.purple : styles.blue}`}>{selection.kind === "menu" ? <ListTree size={18} /> : option?.action === "HUMAN" ? <UserRound size={18} /> : option?.action === "SUBMENU" ? <GitBranch size={18} /> : option?.action === "IMAGE" ? <ImagePlus size={18} /> : <MessageSquare size={18} />}</span><span><strong>{selection.kind === "menu" ? "Menu de opções" : option?.action === "HUMAN" ? "Transferir para humano" : option?.action === "SUBMENU" ? "Ir para outro menu" : option?.action === "IMAGE" ? "Enviar imagem" : "Mensagem"}</strong><small>{option ? "Configure a ação desta opção" : "Personalize o atendimento"}</small></span></div>
          {option ? <>
            <label>Nome da opção<input className={styles.field} maxLength={200} value={option.label} onChange={e => editOption({ label: e.target.value })} /></label>
            <label>Número da opção<input className={styles.field} inputMode="numeric" pattern="[1-9][0-9]{0,2}" maxLength={3} value={option.number} onChange={e => editOption({ number: e.target.value })} /></label>
            {menu.options.some(o => o.id !== option.id && o.number === option.number) && <p role="alert" className={styles.danger}>Número duplicado neste menu.</p>}
            <label>Tipo de ação<select className={styles.field} value={option.action} onChange={e => editOption({ action: e.target.value as BotOption["action"] })}><option value="MESSAGE">Enviar mensagem</option><option value="IMAGE">Enviar imagem</option><option value="SUBMENU">Abrir submenu</option><option value="HUMAN">Transferir para atendimento humano</option></select></label>
            {(option.action === "MESSAGE" || option.action === "IMAGE") && <BotImageInput label={option.action === "IMAGE" ? "Imagem da opção" : "Imagem da mensagem (opcional)"} imageId={option.imageId} disabled={busy || uploadingImage} onUploading={setUploadingImage} onChange={imageId => editOption({ imageId })} />}
            {option.action === "SUBMENU" ? <label>Submenu<select className={styles.field} value={option.targetMenuId} onChange={e => editOption({ targetMenuId: e.target.value })}><option value="">Selecione…</option>{flow.menus.filter(m => m.id !== menuId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><span className={styles.helper}>Escolha um menu existente ou crie um novo abaixo.</span></label> : <label>{option.action === "IMAGE" ? "Legenda (opcional)" : "Conteúdo da resposta"}<textarea className={styles.field} maxLength={8000} value={option.response} onChange={e => editOption({ response: e.target.value })} /></label>}
            {option.action === "SUBMENU" && flow.menus.some(item => item.id === option.targetMenuId) ? <button className={styles.button} onClick={() => openMenu(option.targetMenuId)}><ListTree size={14} /> Editar menu de opções <ChevronRight size={14} /></button> : <><button className={styles.button} disabled={flow.menus.length >= 50} onClick={() => addMenu(option)}><ListTree size={14} /> Criar menu de opções</button><p className={styles.helper}>Ao digitar {option.number}, o cliente recebe as opções desse novo menu.</p></>}
            <label className={styles.check}><input type="checkbox" checked={option.active} onChange={e => editOption({ active: e.target.checked })} /> Opção ativa</label>
            <div className={styles.editorActions}><button className={styles.button} onClick={() => addOption(option.action, option)}><Copy size={13} /> Duplicar</button><button className={styles.iconButton} aria-label="Mover opção para cima" disabled={menu.options.indexOf(option) === 0} onClick={() => move(menu.options.indexOf(option), -1)}><ArrowUp size={14} /></button><button className={styles.iconButton} aria-label="Mover opção para baixo" disabled={menu.options.indexOf(option) === menu.options.length - 1} onClick={() => move(menu.options.indexOf(option), 1)}><ArrowDown size={14} /></button></div>
          </> : <>
            <label>Nome do bot<input className={styles.field} maxLength={100} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} /></label>
            <label>Nome do menu<input className={styles.field} maxLength={100} value={menu.name} onChange={e => editMenu({ name: e.target.value })} /></label>
            {selection.kind === "message" ? <>
              <label>{menu.id === flow.rootMenuId ? "Mensagem inicial" : "Mensagem do submenu"}<textarea className={styles.field} maxLength={8000} value={menu.text} placeholder="Olá! Como podemos ajudar?" onChange={e => editMenu({ text: e.target.value })} /></label>
              <BotImageInput label="Imagem do menu (opcional)" imageId={menu.imageId} disabled={busy || uploadingImage} onUploading={setUploadingImage} onChange={imageId => editMenu({ imageId })} />
              <p className={styles.helper}>Quebras de linha, emojis e links são aceitos. As opções são acrescentadas automaticamente ao texto.</p>
              <p className={styles.helper}>Próximo passo</p><button className={styles.button} onClick={() => selectNode({ kind: "menu" })}><ListTree size={14} /> Editar opções <ChevronRight size={14} /></button>
            </> : <><div className={styles.optionList}>{menu.options.map((o, index) => <div className={styles.optionRow} key={o.id}><button onClick={() => selectNode({ kind: "option", optionId: o.id })}>{o.number} — {o.label}</button><button className={styles.iconButton} aria-label={`Mover ${o.label} para cima`} disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={12} /></button><button className={styles.iconButton} aria-label={`Mover ${o.label} para baixo`} disabled={index === menu.options.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12} /></button></div>)}</div><button className={styles.button} onClick={() => addOption()}><Plus size={14} /> Adicionar opção</button><p className={styles.helper}>0 é reservado para voltar. A ordem dos nós acompanha a ordem das opções; os números são editáveis.</p></>}
          </>}
          {editorHost && notice && <p role="status" className={styles.helper}>{notice}</p>}
          <button className={`${styles.primary} ${styles.saveButton}`} onClick={() => void work(async () => { await save(); })}><Save size={15} /> Salvar rascunho{dirty ? " *" : ""}</button>
        </motion.section>;

  return <main className={styles.root}>
    <motion.header {...entrance} className={styles.header}>
      <Link href="/" className={styles.back} aria-label="Voltar"><ArrowLeft size={14} /></Link>
      <div className={styles.headerRow}>
        <div className={styles.headerActions}>
          {selected && <span className={`${styles.badge} ${bot?.published ? styles.green : styles.amber}`}><span className={`${styles.dot} ${bot?.published ? styles.live : ""}`} />{bot?.published ? "Disponível para o Inforbot" : "Rascunho"}</span>}
          <button className={styles.button} disabled={busy || uploadingImage || loading} onClick={startTest}><BotIcon size={15} /> Testar bot</button>
          <button className={styles.primary} disabled={busy || uploadingImage || loading || !name.trim()} onClick={() => void work(publish)}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />} Publicar</button>
          <button className={styles.iconButton} aria-label="Configurações do bot" disabled={busy} onClick={() => setTab("settings")}><Settings2 size={16} /></button>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Central de Bots">
          {([{ value: "flow", label: "Fluxo", icon: Workflow }, { value: "settings", label: "Configurações", icon: Settings2 }] as const).map(item => <motion.button key={item.value} role="tab" aria-selected={tab === item.value} className={styles.tab} onClick={() => setTab(item.value)} whileTap={reduceMotion ? undefined : { scale: 0.97 }}>
            {tab === item.value && <motion.span aria-hidden="true" className={styles.tabHighlight} layoutId={tabHighlightId} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />}
            <item.icon size={14} /><span>{item.label}</span>
          </motion.button>)}
        </div>
      </div>
    </motion.header>
    <AnimatePresence initial={false}>
      {notice && <motion.div key="notice" {...entrance} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} role="status" className={styles.notice}><p>{notice}</p><button aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={14} /></button></motion.div>}
    </AnimatePresence>
    {loading ? <p className="p-8">Carregando bots…</p> : <motion.fieldset initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.3 }} disabled={busy || uploadingImage} className={styles.workspace}>
      <aside className={styles.sidebar}>
        <motion.section {...entrance} className={styles.panel}><div className={styles.panelTitle}><h2><ShieldCheck size={13} /> Bots da empresa</h2><button className={styles.iconButton} aria-label="Criar bot" title="Criar bot" onClick={() => openBot()}><Plus size={15} /></button></div><div className={styles.botList}>
          {!list.bots.length && <p className={styles.empty}>Seu próximo atendimento começa aqui. Crie um bot para começar.</p>}
          {list.bots.map(b => <button key={b.id} className={styles.botItem} aria-pressed={selected === b.id} onClick={() => openBot(b)}><MessageSquare size={16} /><span><strong>{b.name}</strong><small><i className={`${styles.dot} ${b.published ? styles.live : ""}`} />{b.published ? "Disponível para o Inforbot" : "Rascunho"}</small></span></button>)}
        </div></motion.section>
        <motion.section {...entrance} transition={{ ...entrance.transition, delay: reduceMotion ? 0 : 0.05 }} className={`${styles.panel} ${styles.palette}`}><h2>Componentes</h2><p>Arraste para o fluxo ou clique para adicionar</p><div className={styles.paletteItems}>
          <button className={styles.paletteItem} onClick={() => addMenu(option)} disabled={flow.menus.length >= 50}><span className={`${styles.paletteIcon} ${styles.green}`}><ListTree size={18} /></span><span><strong>Menu de opções</strong><small>{option ? `Cria um submenu para a opção ${option.number}` : "Cria um novo submenu"}</small></span></button>
          {components.map(item => <button key={item.action} className={styles.paletteItem} draggable={!busy} disabled={menu.options.length >= 50} onDragStart={e => { e.dataTransfer.setData("application/cotrimbot-action", item.action); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => addOption(item.action)}><span className={`${styles.paletteIcon} ${styles[item.tone]}`}><item.icon size={18} /></span><span><strong>{item.title}</strong><small>{item.description}</small></span></button>)}
        </div></motion.section>
        <motion.section {...entrance} transition={{ ...entrance.transition, delay: reduceMotion ? 0 : 0.1 }} className={`${styles.panel} ${styles.menuList}`}><h2>Menus do fluxo</h2><div>{flow.menus.map(m => <button key={m.id} className={styles.menuItem} aria-current={menuId === m.id ? "true" : undefined} onClick={() => openMenu(m.id)}><ChevronRight size={12} /><span>{paths.get(m.id) ?? `Sem conexão › ${m.name}`}</span></button>)}</div></motion.section>
      </aside>

      {tab === "settings" ? <motion.section key="settings" {...entrance} className={styles.settingsPanel}><h2>Configurações do bot</h2><label>Nome do bot<input className={styles.field} maxLength={100} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} /></label><label>Resposta para opção inválida<textarea className={styles.field} value={flow.invalidMessage} maxLength={1000} onChange={e => change({ ...flow, invalidMessage: e.target.value })} /></label><label>Texto do comando 0<input className={styles.field} value={flow.backLabel} maxLength={100} onChange={e => change({ ...flow, backLabel: e.target.value })} /></label>
        <p className={styles.helper}>A publicação atualiza o fluxo em produção. Salvar um rascunho mantém a versão publicada.</p><div className={`${styles.actions} mt-5`}><button className={styles.primary} onClick={() => void work(async () => { await save(); })}><Save size={14} /> Salvar rascunho</button>{bot && <button className={styles.button} disabled={!bot.published || !list.instanceAvailable} onClick={() => void work(async () => { await botRequest(`/${bot.id}/activation`, { active: list.activeBotId !== bot.id }); setList(await botRequest<BotList>()); setNotice("Status atualizado."); })}><Power size={14} /> {list.activeBotId === bot.id ? "Desativar" : "Ativar"}</button>}</div>{!list.instanceAvailable && <p className={`${styles.helper} mt-5`}>Ativação indisponível. Verifique a configuração da Evolution e a empresa vinculada à instância.</p>}
      </motion.section> : <>
        <FlowCanvas onEditorHost={setEditorHost} flow={flow} menu={menu} selection={selection} dirty={dirty} disabled={busy || uploadingImage} onSelect={selectNode} onLayout={layout => { setFlow(previous => ({ ...previous, layout })); setDirty(true); }} onAdd={(action, position) => addOption(action, undefined, position)} onOpenMenu={openMenu} onCreateSubmenu={optionId => addMenu(menu.options.find(item => item.id === optionId))} />
        {editorHost ? createPortal(editor, editorHost) : editor}
        <section ref={tester} className={`${styles.testPanel} ${showTest ? styles.testVisible : ""}`} aria-label="Simulador do bot">
          <div className={styles.testTabs} role="tablist" aria-label="Simulador"><button role="tab" aria-selected={testTab === "test"} onClick={() => setTestTab("test")}>Teste do bot</button><button role="tab" aria-selected={testTab === "history"} onClick={() => setTestTab("history")}>Histórico do teste</button>{showTest && <button className={styles.iconButton} aria-label="Fechar teste" onClick={() => setShowTest(false)}><X size={13} /></button>}</div>
          {testTab === "history" ? <div className={styles.history}>{simulation?.messages.length ? simulation.messages.map((m, i) => <div className={styles.historyItem} key={i}><strong>{i + 1} · {m.role === "user" ? "Cliente" : "Bot"}</strong>{m.imageId && <Image src={botImageUrl(m.imageId)} alt="Imagem enviada pelo bot" width={280} height={180} unoptimized className={styles.imagePreview} />}{m.text}</div>) : <p className={styles.empty}>Inicie um teste para acompanhar os passos da conversa.</p>}</div> : <div className={styles.phone}>
            <div className={styles.phoneHeader}><span className={styles.phoneAvatar}><BotIcon size={23} /></span><div><strong>{name || "Seu assistente"}</strong><small>Ambiente de teste</small></div><button aria-label="Reiniciar teste" title="Reiniciar teste" onClick={() => void work(() => simulate([]))}><RotateCcw size={14} /></button></div>
            <div className={styles.messages} aria-live="polite">{!simulation ? <div className={styles.testEmpty}><BotIcon size={36} /><p>Experimente seu atendimento.<br />O teste usa o rascunho atual.</p><button className={styles.button} onClick={startTest}><Play size={13} /> Iniciar teste</button></div> : simulation.messages.map((m, i) => <motion.div {...entrance} key={i} className={`${styles.bubble} ${m.role === "user" ? styles.bubbleUser : ""}`}>{m.imageId && <Image key="image" src={botImageUrl(m.imageId)} alt="Imagem enviada pelo bot" width={280} height={180} unoptimized className={styles.imagePreview} />}<MessageText key="content" content={m.text} /><small key="sender">{m.role === "user" ? "Cliente ✓✓" : "Bot"}</small></motion.div>)}{simulation?.state.status === "WAITING_HUMAN" && <p className={styles.testInfo}>Aguardando atendimento humano. Automação pausada.</p>}<div ref={messagesEnd} /></div>
            {simulation && <div className={styles.quickReplies}>{[...(flow.menus.find(m => m.id === simulation.state.menuId)?.options.filter(o => o.active).map(o => o.number) ?? []), "0"].map(n => <button key={n} disabled={simulation.state.status === "WAITING_HUMAN"} onClick={() => void work(() => simulate([...inputs, n]))}>{n}</button>)}</div>}
            <form className={styles.composer} onSubmit={e => { e.preventDefault(); if (input.trim()) void work(() => simulate([...inputs, input])); }}><input aria-label="Mensagem de teste" placeholder="Digite uma mensagem…" value={input} maxLength={100} onChange={e => setInput(e.target.value)} disabled={!simulation || simulation.state.status === "WAITING_HUMAN"} /><button aria-label="Enviar mensagem de teste" disabled={!simulation || !input.trim() || simulation.state.status === "WAITING_HUMAN"}><Send size={16} /></button></form>
          </div>}
          <p className={styles.testInfo}>Simulação · nenhuma mensagem será enviada ao WhatsApp</p>
        </section>
      </>}
    </motion.fieldset>}
  </main>;
}
