"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Loader2, Megaphone, RefreshCw, Search, Send, Users } from "lucide-react";
import styles from "./announcement-settings.module.css";

const MotionCompanyPopup = motion.create(Combobox.Popup);

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
type Client = { id: string; name: string };
type Preview = { companyName: string; recipients: { id: number; name: string; phone: string }[]; excluded: number; previewToken: string };
type Delivery = { id: string; recipientName: string; phone: string; status: "PENDING" | "PROCESSING" | "SENT" | "FAILED"; error: string | null };
type Announcement = { id: string; companyName: string; content: string; createdAt: string; messages: Delivery[] };
const statusLabel = { PENDING: "Na fila", PROCESSING: "Enviando", SENT: "Enviado", FAILED: "Falhou" };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir. Tente novamente.");
  return data as T;
}

export function AnnouncementSettings() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>([]);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();
  const refreshLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [feedback, setFeedback] = useState("");
  const requestKey = useRef("");
  const lock = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api<{ announcements: Announcement[] }>("/announcements", { signal });
      setHistory(data.announcements);
      setHistoryError("");
    } catch (err) {
      if (!signal?.aborted) setHistoryError(err instanceof Error ? err.message : "Falha ao atualizar os envios.");
    } finally {
      if (!signal?.aborted) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api<{ clients: Client[] }>("/clients", { signal: controller.signal })
      .then((data) => setClients(data.clients))
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return loadHistory(controller.signal); });
    const timer = window.setInterval(() => void loadHistory(controller.signal), 7000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [loadHistory]);

  useEffect(() => { if (preview) reviewHeading.current?.focus(); }, [preview]);

  async function refreshHistory() {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    try { await loadHistory(); }
    finally { refreshLock.current = false; setRefreshing(false); }
  }

  async function review() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(""); setFeedback("");
    try {
      const data = await api<Preview>("/announcements/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, content }),
      });
      requestKey.current = crypto.randomUUID();
      setSelectedRecipientIds(data.recipients.map(contact => contact.id));
      setPreview(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao revisar o comunicado."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function send() {
    if (lock.current || !preview || !selectedRecipientIds.length) return;
    lock.current = true;
    setBusy(true); setError("");
    try {
      await api("/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, content, previewToken: preview.previewToken, requestKey: requestKey.current, recipientIds: selectedRecipientIds }),
      });
      setFeedback(`Comunicado colocado na fila para ${selectedRecipientIds.length} contato(s). Acompanhe os envios abaixo.`);
      setPreview(null); setContent("");
      void loadHistory();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao confirmar o envio."); }
    finally { lock.current = false; setBusy(false); }
  }

  const transition = { duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] as const };
  const reveal = { initial: { opacity: 0, y: reduceMotion ? 0 : 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: reduceMotion ? 0 : -4 }, transition };
  const press = reduceMotion ? undefined : { scale: 0.98 };

  return <MotionConfig reducedMotion="user" transition={transition}>
    <section className={styles.root} aria-label="Notícias">
      <header className={styles.heading}>
        <span className={styles.icon}><Megaphone size={20} strokeWidth={1.5} aria-hidden="true" /></span>
        <div><h3>Notícias</h3><p>Uma mensagem. Mais perto de todos.</p></div>
      </header>
      <div className={styles.steps} aria-label="Etapas do comunicado">
        <span aria-current={!preview ? "step" : undefined} data-active={!preview}>{preview ? <Check size={12} aria-hidden="true" /> : <span>1</span>}Escrever</span>
        <span className={styles.stepLine} aria-hidden="true" />
        <span aria-current={preview ? "step" : undefined} data-active={!!preview}><span>2</span>Revisar e enviar</span>
      </div>
      <AnimatePresence initial={false}>
        {error && <motion.p key="error" {...reveal} className={styles.error} role="alert">{error}</motion.p>}
        {feedback && <motion.div key="success" {...reveal} className={styles.success} role="status"><CheckCircle2 size={20} aria-hidden="true" /><div><strong>Comunicado confirmado</strong><p>{feedback}</p></div></motion.div>}
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        {!preview ? <motion.form key="compose" {...reveal} className={styles.card} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void review(); }}>
          <div className={styles.cardTitle}><h4>Novo comunicado</h4><span>Via WhatsApp</span></div>
          <div className={styles.field}>
            <label id="announcement-company-label" htmlFor="announcement-company">Empresa destinatária</label>
            <Combobox.Root items={clients} value={clients.find((client) => client.id === clientId) ?? null} itemToStringLabel={(client) => client.name} itemToStringValue={(client) => client.id} isItemEqualToValue={(client, value) => client.id === value.id} inputValue={companySearch} onInputValueChange={setCompanySearch} onOpenChange={() => setCompanySearch("")} autoHighlight disabled={loading || busy || !clients.length} onValueChange={(client) => { setClientId(client?.id ?? ""); setFeedback(""); }} required>
              <Combobox.Trigger id="announcement-company" aria-labelledby="announcement-company-label" className={styles.companyTrigger}>
                {clientId && <span className={styles.companyAvatar} aria-hidden="true">{clients.find((client) => client.id === clientId)?.name.trim().charAt(0).toLocaleUpperCase("pt-BR")}</span>}
                <span className={styles.companyValue}><Combobox.Value placeholder={loading ? "Carregando empresas…" : "Selecione uma empresa"} /></span>
                <Combobox.Icon className={styles.companyChevron}><ChevronDown size={15} aria-hidden="true" /></Combobox.Icon>
              </Combobox.Trigger>
              <Combobox.Portal>
                <Combobox.Positioner sideOffset={8} align="start" className={styles.companyPositioner}>
                  <MotionCompanyPopup className={styles.companyPopup} initial={{ opacity: 0, y: reduceMotion ? 0 : -5 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
                    <div className={styles.companySearch}>
                      <Search size={15} aria-hidden="true" />
                      <Combobox.Input aria-label="Buscar empresa" placeholder="Buscar empresa…" autoComplete="off" />
                    </div>
                    <Combobox.Empty className={styles.companyEmpty}>Nenhuma empresa encontrada.</Combobox.Empty>
                    <Combobox.List className={styles.companyList}>
                      {(client: Client) => <Combobox.Item key={client.id} value={client} className={styles.companyOption}>
                        <span className={styles.companyAvatar} aria-hidden="true">{client.name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?"}</span>
                        <span className={styles.companyValue}>{client.name}</span>
                        <Combobox.ItemIndicator className={styles.companyIndicator}><Check size={16} aria-hidden="true" /></Combobox.ItemIndicator>
                      </Combobox.Item>}
                    </Combobox.List>
                  </MotionCompanyPopup>
                </Combobox.Positioner>
              </Combobox.Portal>
            </Combobox.Root>
            {!loading && !clients.length && <p className={styles.note}>Cadastre uma empresa na aba Cliente para começar.</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor="announcement-content">Mensagem do comunicado</label>
            <textarea id="announcement-content" rows={6} maxLength={5000} placeholder="O que você gostaria de compartilhar?" value={content} disabled={busy} onChange={(event) => setContent(event.target.value)} aria-describedby="announcement-hint announcement-count" required />
            <div className={styles.hint}><span id="announcement-hint">Cada contato recebe uma mensagem individual.</span><span id="announcement-count">{content.length.toLocaleString("pt-BR")} / 5.000</span></div>
          </div>
          <div className={styles.footer}><span>Você revisa os destinatários antes de enviar.</span><motion.button whileTap={press} className={styles.primary} disabled={busy || !clientId || !content.trim()}>{busy ? <Loader2 className={styles.spinner} size={15} /> : <ArrowRight size={15} aria-hidden="true" />}{busy ? "Consultando…" : "Revisar destinatários"}</motion.button></div>
        </motion.form> : <motion.div key="review" {...reveal} onAnimationComplete={() => reviewHeading.current?.focus()} className={styles.card} aria-busy={busy}>
          <div className={styles.reviewTitle}><span className={styles.reviewIcon}><Send size={20} strokeWidth={1.5} aria-hidden="true" /></span><h4 ref={reviewHeading} tabIndex={-1}>Revise antes de enviar</h4><p>Confira a mensagem e quem vai recebê-la.</p></div>
          <div className={styles.reviewSummary}><strong>{preview.companyName}</strong><span aria-live="polite"><Users size={14} aria-hidden="true" />{selectedRecipientIds.length} destinatário(s)</span></div>
          <div className={styles.messagePreview}><span className={styles.eyebrow}>Sua mensagem</span><p className={styles.message}>{content.trim()}</p></div>
          <div className={styles.field}><div className={styles.recipientHeading}><span className={styles.eyebrow}>Destinatários</span>{preview.recipients.length > 0 && <button type="button" disabled={busy} onClick={() => setSelectedRecipientIds(selectedRecipientIds.length === preview.recipients.length ? [] : preview.recipients.map(contact => contact.id))}>{selectedRecipientIds.length === preview.recipients.length ? "Desmarcar todos" : "Selecionar todos"}</button>}</div><p className={styles.note}>Desmarque quem não deve receber. A seleção vale apenas para este comunicado.</p><div className={styles.recipients} aria-label="Destinatários do comunicado" tabIndex={0}>
            {preview.recipients.map((contact) => <label className={styles.recipientChoice} data-selected={selectedRecipientIds.includes(contact.id)} key={contact.id}><span className={styles.avatar} aria-hidden="true">{contact.name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?"}</span><span className={styles.contact}>{contact.name}<small>{contact.phone}</small></span><input type="checkbox" aria-label={`Incluir ${contact.name} no comunicado`} checked={selectedRecipientIds.includes(contact.id)} disabled={busy} onChange={event => setSelectedRecipientIds(previous => event.target.checked ? [...previous, contact.id] : previous.filter(id => id !== contact.id))} /></label>)}
            {!preview.recipients.length && <p className={styles.empty}>Nenhum contato disponível. Confira o campo Empresa nas informações dos contatos.</p>}
          </div></div>
          <p className={styles.note}>Grupos, contatos bloqueados, números inválidos e duplicados ficam de fora.{preview.excluded > 0 && ` ${preview.excluded} contato(s) excluído(s).`}</p>
          <div className={styles.actions}>
            <motion.button whileTap={press} type="button" className={styles.secondary} disabled={busy} onClick={() => { setPreview(null); setError(""); }}><ArrowLeft size={15} aria-hidden="true" />Editar</motion.button>
            <motion.button whileTap={press} type="button" className={styles.primary} disabled={busy || !selectedRecipientIds.length} onClick={() => void send()}>{busy ? <Loader2 size={15} className={styles.spinner} /> : <Send size={15} aria-hidden="true" />}{busy ? "Confirmando…" : `Enviar para ${selectedRecipientIds.length} contato(s)`}</motion.button>
          </div>
        </motion.div>}
      </AnimatePresence>
      <div className={styles.history}>
        <header className={styles.historyHeading}><div><h4>Seus últimos comunicados</h4><p>Acompanhe cada envio por aqui.</p></div><motion.button whileTap={press} type="button" className={styles.refresh} disabled={refreshing} onClick={() => void refreshHistory()} aria-label="Atualizar envios" aria-busy={refreshing}><RefreshCw size={15} className={refreshing ? styles.spinner : undefined} aria-hidden="true" /></motion.button></header>
        <AnimatePresence initial={false}>{historyError && <motion.p {...reveal} key="history-error" className={styles.error} role="alert">{historyError}</motion.p>}</AnimatePresence>
        {historyLoading && <div className={styles.empty} role="status"><Loader2 size={18} className={styles.spinner} />Carregando comunicados…</div>}
        {!historyLoading && !historyError && !history.length && <motion.div {...reveal} className={styles.empty}><span className={styles.emptyIcon}><Megaphone size={22} strokeWidth={1.3} aria-hidden="true" /></span><strong>Tudo começa com uma novidade.</strong><p>Seus comunicados aparecerão aqui após a confirmação do envio.</p></motion.div>}
        <AnimatePresence initial={false}>
          {history.map((item) => {
            const sent = item.messages.filter((message) => message.status === "SENT").length;
            const failed = item.messages.filter((message) => message.status === "FAILED").length;
            const pending = item.messages.length - sent - failed;
            const open = expanded.includes(item.id);
            return <motion.article key={item.id} {...reveal} className={styles.historyCard}>
              <div className={styles.historyHeading}><h4>{item.companyName}</h4><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>
              <p className={styles.historyMessage}>{item.content}</p>
              <div className={styles.counts}><span data-status="SENT"><span className={styles.dot} />{sent} enviado(s)</span>{pending > 0 && <span data-status="PENDING"><span className={styles.dot} />{pending} na fila / enviando</span>}{failed > 0 && <span data-status="FAILED"><span className={styles.dot} />{failed} falha(s)</span>}</div>
              <button type="button" className={styles.disclosure} aria-expanded={open} aria-controls={`announcement-deliveries-${item.id}`} onClick={() => setExpanded((ids) => open ? ids.filter((id) => id !== item.id) : [...ids, item.id])}>Ver destinatários e status<motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={14} aria-hidden="true" /></motion.span></button>
              <motion.div id={`announcement-deliveries-${item.id}`} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} className={styles.deliveryPanel} inert={!open} aria-hidden={!open}>
                <div className={styles.recipients} role="region" aria-label={`Envios para ${item.companyName}`} tabIndex={open ? 0 : -1}>
                  {item.messages.map((message) => <div key={message.id}><span className={styles.contact}>{message.recipientName}<small>{message.phone}</small>{message.error && <small className={styles.deliveryError}>{message.error}</small>}</span><span className={styles.badge} data-status={message.status}>{statusLabel[message.status]}</span></div>)}
                </div>
                <p className={styles.note}>Enviado indica confirmação da API do WhatsApp. O histórico não confirma leitura.</p>
              </motion.div>
            </motion.article>;
          })}
        </AnimatePresence>
      </div>
    </section>
  </MotionConfig>;
}
