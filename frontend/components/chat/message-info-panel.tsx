"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCheck, File, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/chat/avatar";
import { MessageText } from "@/components/chat/message-text";
import { getMessageInfo, type MessageInfo, type MessageRecipient } from "@/lib/message-info-api";
import { socket } from "@/lib/socket";
import type { Message } from "@/types/chat";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function ReceiptList({ title, recipients, read }: { title: string; recipients: MessageRecipient[]; read: boolean }) {
  return <section className="px-5 py-5">
    <h3 className="mb-4 flex items-center gap-2 text-xs font-normal text-zinc-400"><CheckCheck aria-hidden="true" className={`size-4 ${read ? "text-white" : "text-zinc-500"}`} strokeWidth={1.6} />{title}<span className="ml-auto text-zinc-600">{recipients.length}</span></h3>
    {recipients.length ? <ul className="space-y-5">{recipients.map(recipient => {
      const name = recipient.name || (recipient.phone ? `+${recipient.phone}` : "Participante");
      const timestamp = read ? recipient.readAt : recipient.deliveredAt;
      return <li key={recipient.recipientId} className="flex items-center gap-3">
        <Avatar contact={{ name, profilePictureUrl: recipient.profilePictureUrl }} className="size-9 text-xs" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-normal text-zinc-200">{name}</p>{timestamp && <time dateTime={timestamp} className="mt-1 block text-xs text-zinc-500">{dateFormatter.format(new Date(timestamp))}</time>}</div>
      </li>;
    })}</ul> : <p className="text-xs leading-5 text-zinc-600">{read ? "Nenhuma leitura confirmada ainda." : "Nenhuma entrega pendente de leitura confirmada."}</p>}
  </section>;
}

export function MessageInfoPanel({ message, groupName, onClose }: { message: Message; groupName: string; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<MessageInfo | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const caption = !/^\[(Imagem|Vídeo|Áudio|Sticker|Documento)\]$/.test(message.content) && message.content;
  const mediaUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/messages/${message.id}/media`;

  useEffect(() => {
    const controller = new AbortController();
    void getMessageInfo(message.id, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [message.id, reload]);

  useEffect(() => {
    const refresh = (payload: { messageId: number }) => { if (payload.messageId === message.id) setReload(value => value + 1); };
    const reconnect = () => setReload(value => value + 1);
    socket.on("message_receipts_updated", refresh);
    socket.on("connect", reconnect);
    return () => { socket.off("message_receipts_updated", refresh); socket.off("connect", reconnect); };
  }, [message.id]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return createPortal(<motion.div className="fixed inset-0 z-[110] flex justify-end" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
    <button type="button" tabIndex={-1} aria-label="Fechar dados da mensagem" onClick={onClose} className="absolute inset-0 bg-black/40" />
    <motion.aside ref={panelRef} role="dialog" aria-modal="true" aria-label="Dados da mensagem" initial={reduceMotion ? false : { x: 36 }} animate={{ x: 0 }} exit={{ x: 36 }} transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }} className="relative flex h-full w-full max-w-[420px] flex-col border-l border-white/[0.08] bg-[#09090b] text-zinc-200">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Voltar à conversa" className="flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"><X aria-hidden="true" className="size-[18px]" /></button>
        <div className="min-w-0"><h2 className="text-sm font-normal">Dados da mensagem</h2><p className="mt-1 truncate text-xs text-zinc-500">{groupName}</p></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-end border-y border-white/[0.05] px-5 py-6">
          <div className="max-w-[260px] rounded-2xl bg-zinc-800 p-2">
            {message.type === "IMAGE" ? <div className="w-min max-w-full">
              {/* A mídia autenticada é servida pelo backend. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl} alt="Imagem da mensagem" className="block max-h-56 max-w-[min(240px,70vw)] rounded-xl object-contain" />
              {caption && <p className="w-0 min-w-full px-1 pt-2 text-xs leading-5 [overflow-wrap:anywhere]"><MessageText content={caption} showSignature /></p>}
            </div> : message.type === "TEXT" ? <p className="px-1 text-sm leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]"><MessageText content={message.content} showSignature /></p> : <div className="flex items-center gap-2 px-1 text-xs"><File className="size-4 shrink-0" /><span className="line-clamp-3">{caption || (message.type === "VIDEO" ? "Vídeo" : message.type === "AUDIO" ? "Mensagem de áudio" : "Arquivo")}</span></div>}
            <time dateTime={message.createdAt} className="mt-2 block text-right text-[10px] text-zinc-500">{dateFormatter.format(new Date(message.createdAt))}</time>
          </div>
        </div>
        {error && <div role="alert" className="px-5 py-5 text-xs leading-5 text-zinc-400"><p>Não foi possível atualizar os dados da mensagem.</p><button type="button" onClick={() => { setError(false); setReload(value => value + 1); }} className="mt-2 text-zinc-300 transition-colors hover:text-white">Tentar novamente</button></div>}
        {!data && !error ? <p role="status" className="px-5 py-8 text-xs text-zinc-500">Carregando confirmações…</p> : data && <div className="divide-y divide-white/[0.06]">
          <ReceiptList title="Lida por" recipients={data.readBy} read />
          <ReceiptList title="Entregue para" recipients={data.deliveredTo} read={false} />
        </div>}
        <p className="px-5 pt-3 text-[11px] leading-5 text-zinc-600">As confirmações aparecem conforme chegam do WhatsApp.</p>
      </div>
    </motion.aside>
  </motion.div>, document.body);
}
