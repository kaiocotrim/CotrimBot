"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Megaphone, RefreshCw, Send, Users } from "lucide-react";
import styles from "./announcement-settings.module.css";

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
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
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
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api<{ clients: Client[] }>("/clients", { signal: controller.signal })
      .then((data) => setClients(data.clients))
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void loadHistory(controller.signal);
    const timer = window.setInterval(() => void loadHistory(controller.signal), 7000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [loadHistory]);

  useEffect(() => { if (preview) reviewHeading.current?.focus(); }, [preview]);

  async function review() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(""); setFeedback("");
    try {
      const data = await api<Preview>("/announcements/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, content }),
      });
      requestKey.current = crypto.randomUUID();
      setPreview(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao revisar o comunicado."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function send() {
    if (lock.current || !preview?.recipients.length) return;
    lock.current = true;
    setBusy(true); setError("");
    try {
      await api("/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, content, previewToken: preview.previewToken, requestKey: requestKey.current }),
      });
      setFeedback(`Comunicado colocado na fila para ${preview.recipients.length} contato(s). Acompanhe os envios abaixo.`);
      setPreview(null); setContent("");
      void loadHistory();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao confirmar o envio."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <section className={styles.root} aria-label="Notícias">
    <header className={styles.heading}>
      <span className={styles.icon}><Megaphone size={21} strokeWidth={1.6} /></span>
      <div><h3>Notícias</h3><p>Compartilhe comunicados com os contatos de uma empresa.</p></div>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {feedback && <p className={styles.success} role="status"><CheckCircle2 size={18} />{feedback}</p>}
    {!preview ? <form className={styles.card} onSubmit={(event) => { event.preventDefault(); void review(); }}>
      <label htmlFor="announcement-company">Empresa destinatária</label>
      <select id="announcement-company" value={clientId} disabled={loading || busy} onChange={(event) => { setClientId(event.target.value); setFeedback(""); }} required>
        <option value="">{loading ? "Carregando empresas…" : "Selecione uma empresa"}</option>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select>
      {!loading && !clients.length && <p>Cadastre uma empresa na aba Cliente para começar.</p>}
      <label htmlFor="announcement-content">Mensagem do comunicado</label>
      <textarea id="announcement-content" rows={6} maxLength={5000} placeholder="Olá! Temos uma novidade para compartilhar…" value={content} disabled={busy} onChange={(event) => setContent(event.target.value)} required />
      <div className={styles.hint}><span>Enviada individualmente pelo WhatsApp conectado.</span><span>{content.length}/5.000</span></div>
      <button className={styles.primary} disabled={busy || !clientId || !content.trim()}><Users size={16} />{busy ? "Consultando…" : "Revisar destinatários"}</button>
    </form> : <div className={styles.card}>
      <h4 ref={reviewHeading} tabIndex={-1}>Revise antes de enviar</h4>
      <p><strong>{preview.companyName}</strong> · {preview.recipients.length} destinatário(s)</p>
      <p className={styles.message}>{content.trim()}</p>
      <div className={styles.recipients} aria-label="Destinatários do comunicado">
        {preview.recipients.map((contact) => <div key={contact.id}><span>{contact.name}</span><span>{contact.phone}</span></div>)}
        {!preview.recipients.length && <p>Nenhum contato disponível. Confira o campo Empresa nas informações dos contatos.</p>}
      </div>
      <p className={styles.note}>Grupos, contatos bloqueados, números inválidos e duplicados ficam de fora.{preview.excluded > 0 && ` ${preview.excluded} contato(s) excluído(s).`}</p>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => { setPreview(null); setError(""); }}><ArrowLeft size={15} />Editar</button>
        <button type="button" className={styles.primary} disabled={busy || !preview.recipients.length} onClick={() => void send()}><Send size={15} />{busy ? "Confirmando…" : `Enviar para ${preview.recipients.length} contato(s)`}</button>
      </div>
    </div>}
    <header className={styles.historyHeading}><h4>Seus últimos comunicados</h4><button type="button" onClick={() => void loadHistory()} aria-label="Atualizar envios"><RefreshCw size={15} /></button></header>
    {historyError && <p className={styles.error} role="alert">{historyError}</p>}
    {!history.length && <p className={styles.note}>Seus comunicados aparecerão aqui após a confirmação do envio.</p>}
    {history.map((item) => {
      const sent = item.messages.filter((message) => message.status === "SENT").length;
      const failed = item.messages.filter((message) => message.status === "FAILED").length;
      const pending = item.messages.length - sent - failed;
      return <article key={item.id} className={styles.card}>
        <div className={styles.historyHeading}><h4>{item.companyName}</h4><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("pt-BR")}</time></div>
        <p className={styles.message}>{item.content}</p>
        <div className={styles.counts}><span>{sent} enviado(s)</span><span>{pending} na fila / enviando</span>{failed > 0 && <span className={styles.error}>{failed} falha(s)</span>}</div>
        <details><summary>Ver destinatários e status</summary><div className={styles.recipients}>
          {item.messages.map((message) => <div key={message.id}><span>{message.recipientName}<small>{message.phone}</small>{message.error && <small className={styles.error}>{message.error}</small>}</span><span data-status={message.status}>{statusLabel[message.status]}</span></div>)}
        </div></details>
        <p className={styles.note}>Enviado indica confirmação da API do WhatsApp. O histórico não confirma leitura.</p>
      </article>;
    })}
  </section>;
}
