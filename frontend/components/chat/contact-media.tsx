"use client";

import { ChevronRight, Images, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { LibraryContent, MediaThumbnail } from "@/components/chat/media-library";
import { getContactMediaSummary, type ContactMediaSummary } from "@/lib/media-library-api";
import styles from "./media-library.module.css";

export function ContactMediaSummary({ contactId, onOpen }: { contactId: number; onOpen: () => void }) {
  const [result, setResult] = useState<{ contactId: number; data?: ContactMediaSummary; error?: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const current = result?.contactId === contactId ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    void getContactMediaSummary(contactId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ contactId, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ contactId, error: true });
    });
    return () => controller.abort();
  }, [contactId, reload]);

  return <section className={styles.contactSummary} aria-label="Conteúdo compartilhado">
    <button type="button" onClick={onOpen} className={styles.summaryButton} aria-label="Abrir mídia, links e docs">
      <span className={styles.summaryHeading}>
        <Images size={19} strokeWidth={1.8} aria-hidden="true" />
        <span>Mídia, links e docs</span>
        {!current ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-label="Carregando mídias do contato" /> : current.data && <span className={styles.summaryCount}>{current.data.count.toLocaleString("pt-BR")}</span>}
        <ChevronRight size={16} aria-hidden="true" />
      </span>
      {!current ? <span className={styles.summaryGrid} aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <span key={index} className={`${styles.summaryTile} ${styles.skeleton}`} />)}</span>
        : current.data?.items.length ? <span className={styles.summaryGrid}>{current.data.items.map((item) => <span key={item.id} className={styles.summaryTile}><MediaThumbnail item={item} showContactName={false} /></span>)}</span>
          : current.data && <span className={styles.summaryEmpty}>{current.data.count ? "Ver documentos e links compartilhados" : "Nenhum conteúdo compartilhado ainda"}</span>}
    </button>
    {current?.error && <div className={styles.summaryError}><p role="alert">Não foi possível carregar as mídias.</p><button type="button" onClick={() => { setResult(null); setReload((value) => value + 1); }}>Tentar novamente</button></div>}
  </section>;
}

export function ContactMediaBrowser({ contactId, contactName, onBack }: { contactId: number; contactName: string; onBack: () => void }) {
  const [allConversations, setAllConversations] = useState(false);
  return <div className={styles.contactBrowser}>
    <LibraryContent key={allConversations ? "all" : contactId} contactId={allConversations ? undefined : contactId} contactName={allConversations ? undefined : contactName} onBack={allConversations ? () => setAllConversations(false) : onBack} />
    {!allConversations && <footer className={styles.contactFooter}><button type="button" onClick={() => setAllConversations(true)}><Images size={18} aria-hidden="true" />Ver mídias de todas as conversas</button></footer>}
  </div>;
}
