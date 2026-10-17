"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Download, FileText, Images, Link2, LoaderCircle, Search, SlidersHorizontal, SquareCheck, Video, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { downloadLibraryItem, getMediaLibrary, libraryMediaUrl, type MediaLibraryItem, type MediaLibraryPage, type MediaLibraryTab } from "@/lib/media-library-api";
import styles from "./media-library.module.css";

const tabs = [{ value: "media", label: "Mídias" }, { value: "documents", label: "Documentos" }, { value: "links", label: "Links" }] as const;
const emptyItems: MediaLibraryItem[] = [];
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const dayFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function dateLabel(value: string) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (dayFormat.format(new Date(value)) === dayFormat.format(today)) return "Hoje";
  if (dayFormat.format(new Date(value)) === dayFormat.format(yesterday)) return "Ontem";
  return dateFormat.format(new Date(value));
}

export function MediaThumbnail({ item, showContactName = true }: { item: MediaLibraryItem; showContactName?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "300px" });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={ref} style={{ display: "block", width: "100%", height: "100%" }}>
      {!loaded && !failed && <span aria-hidden="true" className={styles.skeleton} style={{ position: "absolute", inset: 0 }} />}
      {failed ? <span className={styles.placeholder}><Images size={26} aria-label="Prévia indisponível" /></span> : visible && (item.type === "VIDEO"
        ? <video src={libraryMediaUrl(item.id)} muted playsInline preload="metadata" onLoadedData={() => setLoaded(true)} onError={() => setFailed(true)} onLoadedMetadata={(event) => {
          setLoaded(true);
          const seconds = event.currentTarget.duration;
          if (Number.isFinite(seconds)) setDuration(`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`);
        }} />
        // A mídia vem do endpoint autenticado de mensagens.
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={libraryMediaUrl(item.id)} alt="" loading="lazy" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />)}
      {(showContactName || item.type === "VIDEO") && <span className={styles.tileInfo}>
        {item.type === "VIDEO" && <span className={styles.videoLabel}><Video size={14} aria-hidden="true" />{duration || "Vídeo"}</span>}
        {showContactName && <strong>{item.contactName}</strong>}
      </span>}
    </span>
  );
}

function LibrarySkeleton({ tab }: { tab: MediaLibraryTab }) {
  return <div role="status" aria-label="Carregando biblioteca" aria-busy="true">
    <div className={styles.groupTitle}><div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: 90 }} /></div>
    {tab === "media" ? <div className={styles.grid}>{Array.from({ length: 15 }, (_, index) => <div key={index} aria-hidden="true" className={`${styles.skeleton} ${styles.skeletonTile}`} />)}</div>
      : <div className={styles.rows}>{Array.from({ length: 7 }, (_, index) => <div key={index} className={styles.row} aria-hidden="true"><span className={`${styles.fileIcon} ${styles.skeleton}`} /><span className={styles.rowText}><span className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: "65%" }} /><span className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: "35%" }} /></span></div>)}</div>}
  </div>;
}

export function MediaLibrary() {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger aria-label="Mídias de todas as conversas" title="Mídias" className="flex size-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-white/70"><Images className="size-5" strokeWidth={1.8} aria-hidden="true" /></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className={styles.backdrop} />
      <Dialog.Popup className={styles.dialog}>
        {open && <LibraryContent />}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function LibraryContent({ contactId, contactName, onBack }: { contactId?: number; contactName?: string; onBack?: () => void } = {}) {
  const reduceMotion = useReducedMotion();
  const libraryId = useId();
  const [tab, setTab] = useState<MediaLibraryTab>("media");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [reload, setReload] = useState(0);
  const scope = `${contactId ?? "all"}:${tab}:${search}:${sort}:${reload}`;
  const [result, setResult] = useState<MediaLibraryPage & { scope: string; status: "loading" | "ready" | "error" }>({ scope, status: "loading", items: [], hasMore: false, nextCursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaLibraryItem | null>(null);
  const [previewError, setPreviewError] = useState<number | null>(null);
  const moreRequest = useRef<AbortController | null>(null);
  const loading = result.scope !== scope || result.status === "loading";
  const items = result.scope === scope ? result.items : emptyItems;
  const groups = useMemo(() => {
    const grouped = new Map<string, { title: string; items: MediaLibraryItem[] }>();
    for (const item of items) {
      const day = dayFormat.format(new Date(item.createdAt));
      if (!grouped.has(day)) grouped.set(day, { title: dateLabel(item.createdAt), items: [] });
      grouped.get(day)!.items.push(item);
    }
    return [...grouped.entries()];
  }, [items]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    moreRequest.current?.abort();
    void getMediaLibrary(tab, search, sort, null, controller.signal, contactId).then((page) => {
      if (!controller.signal.aborted) setResult({ ...page, scope, status: "ready" });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ scope, status: "error", items: [], hasMore: false, nextCursor: null });
    });
    return () => { controller.abort(); moreRequest.current?.abort(); };
  }, [tab, search, sort, scope, contactId]);

  async function loadMore() {
    if (loadingMore || loading || !result.hasMore) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setActionError(null);
    try {
      const page = await getMediaLibrary(tab, search, sort, result.nextCursor, controller.signal, contactId);
      if (!controller.signal.aborted) setResult((current) => ({ ...page, scope, status: "ready", items: [...current.items, ...page.items.filter((item) => !current.items.some((existing) => existing.id === item.id))] }));
    } catch { if (!controller.signal.aborted) setActionError("Não foi possível carregar mais itens."); }
    finally { setLoadingMore(false); }
  }

  function toggle(id: number) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function changeTab(value: MediaLibraryTab) { setTab(value); setSelected(new Set()); setSelectionMode(false); setActionError(null); setNotice(null); }

  async function download(item: MediaLibraryItem) {
    setActionError(null);
    try { await downloadLibraryItem(item); } catch (error) { setActionError(error instanceof Error ? error.message : "Não foi possível baixar o arquivo."); }
  }

  async function selectedAction() {
    setDownloading(true);
    setActionError(null);
    try {
      const entries = items.filter((item) => selected.has(item.id));
      if (tab === "links") { await navigator.clipboard.writeText(entries.flatMap((item) => item.links).join("\n")); setNotice("Links copiados."); }
      else for (const item of entries) await downloadLibraryItem(item);
    } catch { setActionError("Não foi possível concluir a ação. Tente novamente."); }
    finally { setDownloading(false); }
  }

  const marker = (item: MediaLibraryItem, row = false) => selectionMode && <span aria-hidden="true" className={row ? styles.rowCheck : styles.check}>{selected.has(item.id) && <Check size={15} />}</span>;
  const emptyLabel = tab === "media" ? "Nenhuma mídia encontrada" : tab === "documents" ? "Nenhum documento encontrado" : "Nenhum link encontrado";
  const media = items.filter((item) => item.type === "IMAGE" || item.type === "VIDEO");
  const previewIndex = media.findIndex((item) => item.id === preview?.id);

  return <>
    <header className={styles.header}>
      {onBack ? <div className={styles.panelHeading}><button autoFocus type="button" aria-label="Voltar" className={styles.iconButton} onClick={onBack}><ArrowLeft size={19} /></button><div className={styles.heading}><h2 className={styles.title}>Mídia, links e docs</h2><p className={styles.subtitle}>{contactName ?? "Mídias de todas as conversas"}</p></div></div> : <div className={styles.heading}><Dialog.Title className={styles.title}>Mídia</Dialog.Title><Dialog.Description className={styles.subtitle}>Mídias de todas as conversas</Dialog.Description></div>}
      <LayoutGroup><div className={styles.tabs} role="tablist" aria-label="Tipos de conteúdo">
        {tabs.map((option, index) => <button key={option.value} type="button" id={`${libraryId}-tab-${option.value}`} role="tab" aria-selected={tab === option.value} aria-controls={`${libraryId}-panel`} tabIndex={tab === option.value ? 0 : -1} onClick={() => changeTab(option.value)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
          changeTab(tabs[next].value);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }} className={styles.tab}>{option.label}{tab === option.value && <motion.span layoutId="library-tab-indicator" className={styles.indicator} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }} />}</button>)}
      </div></LayoutGroup>
      <div className={styles.tools}>
        <button type="button" aria-label="Pesquisar na biblioteca" title="Pesquisar" aria-pressed={searchOpen} className={styles.iconButton} onClick={() => { setSearchOpen((open) => !open); setQuery(""); setSearch(""); }}><Search size={17} /></button>
        <button type="button" aria-label={sort === "newest" ? "Ordenar dos mais antigos para os mais recentes" : "Ordenar dos mais recentes para os mais antigos"} title={sort === "newest" ? "Mais recentes primeiro" : "Mais antigos primeiro"} className={styles.iconButton} onClick={() => { setSort((current) => current === "newest" ? "oldest" : "newest"); setSelected(new Set()); }}><SlidersHorizontal size={17} /></button>
        <button type="button" aria-label="Selecionar itens" title="Selecionar" aria-pressed={selectionMode} className={styles.iconButton} onClick={() => { setSelectionMode((current) => !current); setSelected(new Set()); }}><SquareCheck size={17} /></button>
        {!onBack && <Dialog.Close aria-label="Fechar biblioteca" title="Fechar" className={styles.iconButton}><X size={19} /></Dialog.Close>}
      </div>
    </header>
    <AnimatePresence initial={false}>{searchOpen && <motion.div initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}><label className={styles.search}><Search size={17} /><input autoFocus type="search" aria-label="Pesquisar mídias, documentos ou links" placeholder="Pesquisar por nome, conversa ou conteúdo" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(new Set()); }} /></label></motion.div>}</AnimatePresence>
    {selectionMode && <div className={styles.selection}><span>{selected.size} selecionado{selected.size === 1 ? "" : "s"}</span><div><button type="button" onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((item) => item.id)))} disabled={!items.length}>{selected.size === items.length && items.length ? "Limpar seleção" : "Selecionar tudo"}</button><button type="button" aria-label={tab === "links" ? "Copiar links selecionados" : "Baixar itens selecionados"} disabled={!selected.size || downloading} onClick={() => void selectedAction()}>{downloading ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /> : tab === "links" ? <Copy size={16} /> : <Download size={16} />}</button></div></div>}
    {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
    {notice && <p role="status" className={styles.subtitle} style={{ padding: "8px 18px" }}>{notice}</p>}
    <div id={`${libraryId}-panel`} role="tabpanel" aria-labelledby={`${libraryId}-tab-${tab}`} className={styles.scroll}>
      {loading ? <LibrarySkeleton tab={tab} /> : result.status === "error" ? <div className={styles.empty}><Images size={32} /><strong>Não foi possível carregar a biblioteca</strong><button type="button" className={styles.retry} onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></div>
          : !items.length ? <div className={styles.empty}>{tab === "links" ? <Link2 size={32} /> : tab === "documents" ? <FileText size={32} /> : <Images size={32} />}<strong>{emptyLabel}</strong><p>{search ? "Tente buscar por outro nome ou conteúdo." : contactId !== undefined ? "Os arquivos compartilhados nesta conversa aparecerão aqui." : "Os arquivos compartilhados nas conversas aparecerão aqui."}</p></div>
          : groups.map(([day, group]) => <motion.section key={day} initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <div className={tab === "media" ? styles.grid : styles.rows}>
              {group.items.map((item) => tab === "media" ? <button key={item.id} type="button" className={styles.tile} aria-label={`${item.type === "VIDEO" ? "Vídeo" : "Imagem"} de ${item.contactName}, ${dateFormat.format(new Date(item.createdAt))}`} aria-pressed={selectionMode ? selected.has(item.id) : undefined} onClick={() => selectionMode ? toggle(item.id) : setPreview(item)}><MediaThumbnail item={item} showContactName={contactId === undefined} />{marker(item)}</button>
                : <div key={item.id} className={styles.row}>
                  {tab === "documents" ? <><button type="button" className={styles.rowMain} aria-pressed={selectionMode ? selected.has(item.id) : undefined} onClick={() => selectionMode ? toggle(item.id) : void download(item)}>{marker(item, true)}<span className={styles.fileIcon}><FileText size={23} /></span><span className={styles.rowText}><strong>{item.fileName || "Documento"}</strong><span>{item.contactName} · {item.senderName}</span><span>{timeFormat.format(new Date(item.createdAt))}</span></span></button>{!selectionMode && <button type="button" className={styles.iconButton} aria-label={`Baixar ${item.fileName || "documento"}`} onClick={() => void download(item)}><Download size={17} /></button>}</>
                    : <>{selectionMode && <button type="button" aria-label={`Selecionar links de ${item.contactName}`} aria-pressed={selected.has(item.id)} onClick={() => toggle(item.id)}>{marker(item, true)}</button>}<span className={styles.fileIcon}><Link2 size={23} /></span><div className={styles.rowText}>{item.links.map((link) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" title={link}>{link}</a>)}<span>{item.contactName} · {timeFormat.format(new Date(item.createdAt))}</span></div></>}
                </div>)}
            </div>
          </motion.section>)}
      {!loading && result.hasMore && <div className={styles.footer}><button type="button" className={styles.loadMore} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Carregando…" : "Carregar mais"}</button></div>}
    </div>
    <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <Dialog.Portal><Dialog.Backdrop forceRender className={styles.viewerBackdrop} /><Dialog.Popup className={styles.viewer}>
        <header className={styles.viewerHeader}><div className={styles.viewerHeading}><Dialog.Title className={styles.title}>{preview?.contactName}</Dialog.Title><Dialog.Description className={styles.subtitle}>{preview && timeFormat.format(new Date(preview.createdAt))}</Dialog.Description></div><button type="button" className={styles.iconButton} aria-label="Baixar mídia" onClick={() => { if (preview) void download(preview); }}><Download size={18} /></button><Dialog.Close aria-label="Fechar visualização" className={styles.iconButton}><X size={20} /></Dialog.Close></header>
        <div className={styles.viewerImage}>
          {preview && (previewError === preview.id ? <p className={styles.error}>Não foi possível abrir esta mídia.</p> : preview.type === "VIDEO" ? <video key={preview.id} src={libraryMediaUrl(preview.id)} controls playsInline autoPlay onError={() => setPreviewError(preview.id)} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img key={preview.id} src={libraryMediaUrl(preview.id)} alt={`Imagem compartilhada em ${preview.contactName}`} onError={() => setPreviewError(preview.id)} />)}
          {previewIndex > 0 && <button type="button" aria-label="Mídia anterior" className={`${styles.iconButton} ${styles.previous}`} onClick={() => setPreview(media[previewIndex - 1])}><ChevronLeft size={23} /></button>}
          {previewIndex >= 0 && previewIndex < media.length - 1 && <button type="button" aria-label="Próxima mídia" className={`${styles.iconButton} ${styles.next}`} onClick={() => setPreview(media[previewIndex + 1])}><ChevronRight size={23} /></button>}
        </div>
      </Dialog.Popup></Dialog.Portal>
    </Dialog.Root>
  </>;
}
