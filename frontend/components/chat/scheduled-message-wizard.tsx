"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Search, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CalendarDatePicker } from "@/components/chat/calendar-date-picker";
import { CalendarTimePicker } from "@/components/chat/calendar-time-picker";
import { Avatar } from "@/components/chat/avatar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type SavedContact = {
  id: number;
  name: string;
  phone: string;
  companyName: string | null;
  profilePictureUrl: string | null;
};

export type ScheduledMessage = {
  id: string;
  phone: string;
  content: string;
  scheduledAt: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
  sentAt?: string | null;
  contactName: string | null;
};

function dateKey(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function timeKey(value: Date) {
  return [String(value.getHours()).padStart(2, "0"), String(value.getMinutes()).padStart(2, "0")].join(":");
}

export function ScheduledMessageWizard({ step, onStepChange, onBack, onScheduled }: {
  step: number;
  onStepChange: (step: number) => void;
  onBack: () => void;
  onScheduled: (message: ScheduledMessage) => void;
}) {
  const reduceMotion = useReducedMotion();
  const recipientRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState("");
  const [selectedContact, setSelectedContact] = useState<SavedContact | null>(null);
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [searchedContacts, setSearchedContacts] = useState(false);
  const [activeContactIndex, setActiveContactIndex] = useState(0);
  const [content, setContent] = useState("");
  const [initialDate] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [date, setDate] = useState(() => dateKey(initialDate));
  const [time, setTime] = useState(() => timeKey(initialDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ step: number; message: string } | null>(null);

  useEffect(() => {
    const query = phone.trim();
    if (step !== 0 || selectedContact || query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingContacts(true);
      try {
        const response = await fetch(`${API_URL}/contacts/search?query=${encodeURIComponent(query)}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Falha ao buscar contatos");
        const payload = await response.json() as { contacts?: SavedContact[] };
        if (!controller.signal.aborted) {
          setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
          setSearchedContacts(true);
        }
      } catch {
        if (!controller.signal.aborted) setContacts([]);
      } finally {
        if (!controller.signal.aborted) setSearchingContacts(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [phone, selectedContact, step]);

  function selectContact(contact: SavedContact) {
    setSelectedContact(contact);
    setPhone(contact.phone);
    setContacts([]);
    setSearchingContacts(false);
    setError(null);
  }

  function handleRecipientKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!contacts.length || selectedContact) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveContactIndex((current) => (current + (event.key === "ArrowDown" ? 1 : contacts.length - 1)) % contacts.length);
    } else if (event.key === "Enter" && /[a-zÀ-ÿ]/i.test(phone)) {
      event.preventDefault();
      selectContact(contacts[activeContactIndex] ?? contacts[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setContacts([]);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (step === 0) {
      const digits = phone.replace(/\D/g, "");
      if (!selectedContact && /[a-zÀ-ÿ]/i.test(phone)) {
        setError({ step, message: "Selecione um contato da lista para usar o número dele." });
        return;
      }
      if (![10, 11].includes(digits.length) && (digits.length < 12 || digits.length > 15)) {
        setError({ step, message: "Informe um número válido com DDD ou escolha um contato." });
        return;
      }
      onStepChange(1);
      return;
    }
    if (step === 1) {
      if (!content.trim()) {
        setError({ step, message: "Escreva a mensagem antes de continuar." });
        return;
      }
      onStepChange(2);
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      setError({ step, message: "Escolha uma data e horário futuros." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/scheduled-messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, content: content.trim(), scheduledAt: scheduledAt.toISOString() }),
      });
      const payload = await response.json().catch(() => ({})) as { scheduledMessage?: Omit<ScheduledMessage, "contactName">; error?: string };
      if (!response.ok || !payload.scheduledMessage) throw new Error(payload.error || "Não foi possível programar a mensagem.");
      onScheduled({ ...payload.scheduledMessage, contactName: selectedContact?.name ?? null });
    } catch (cause) {
      setError({ step, message: cause instanceof Error ? cause.message : "Não foi possível programar a mensagem." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} onKeyDownCapture={(event) => { if (saving && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } }} className="w-full max-w-lg px-5 pb-10 sm:px-8">
      <div className="mb-8 flex items-center justify-between text-xs text-zinc-500">
        <span>Programar mensagem</span>
        <span>{step + 1} de 3</span>
      </div>
      <div aria-hidden="true" className="mb-8 flex gap-1.5">
        {[0, 1, 2].map((index) => <span key={index} className={["h-1 flex-1 rounded-full transition-colors duration-300", index <= step ? "bg-zinc-200" : "bg-white/[0.09]"].join(" ")} />)}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }} transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeInOut" }}>
          {step === 0 ? (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Para quem enviar?</h2>
              <p className="mt-2 text-sm text-zinc-500">Pesquise um contato salvo ou digite o número com DDD.</p>
              <div className="relative mt-8">
                <label htmlFor="scheduled-message-recipient" className="block text-sm text-zinc-400">Contato ou número do WhatsApp</label>
                <div className="mt-2 flex h-13 items-center gap-3 rounded-xl bg-white/[0.045] px-4 transition-colors hover:bg-white/[0.07] focus-within:bg-white/[0.08] focus-within:outline-2 focus-within:outline-white/40">
                  <Search aria-hidden="true" className="size-4 shrink-0 text-zinc-500" />
                  <input ref={recipientRef} id="scheduled-message-recipient" autoFocus required readOnly={Boolean(selectedContact)} type="text" autoComplete="off" maxLength={100} value={selectedContact ? selectedContact.name : phone} onChange={(event) => { setSelectedContact(null); setPhone(event.target.value); setContacts([]); setSearchingContacts(false); setSearchedContacts(false); setActiveContactIndex(0); setError(null); }} onKeyDown={handleRecipientKeyDown} role="combobox" aria-autocomplete="list" aria-expanded={contacts.length > 0 && !selectedContact} aria-controls="scheduled-message-contacts" aria-activedescendant={contacts.length && !selectedContact ? `scheduled-message-contact-${contacts[activeContactIndex]?.id}` : undefined} placeholder="Nome ou +55 11 99999-9999" className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-600" />
                  {selectedContact && <button type="button" aria-label="Remover contato selecionado" onClick={() => { setSelectedContact(null); setPhone(""); setContacts([]); recipientRef.current?.focus(); }} className="rounded-full p-1 text-zinc-500 hover:bg-white/[0.08] hover:text-white"><X aria-hidden="true" className="size-4" /></button>}
                </div>
                {contacts.length > 0 && !selectedContact && (
                  <div id="scheduled-message-contacts" role="listbox" aria-label="Contatos encontrados" className="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/[0.09] bg-zinc-900 p-1.5 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {contacts.map((contact, index) => (
                      <button id={`scheduled-message-contact-${contact.id}`} key={contact.id} type="button" role="option" aria-selected={index === activeContactIndex} onMouseEnter={() => setActiveContactIndex(index)} onClick={() => selectContact(contact)} className={["flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", index === activeContactIndex ? "bg-white/[0.09]" : "hover:bg-white/[0.06]"].join(" ")}>
                        <Avatar contact={contact} className="size-9 text-xs" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-zinc-100">{contact.name}</span><span className="block truncate text-xs text-zinc-500">{contact.phone}{contact.companyName ? ` · ${contact.companyName}` : ""}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedContact ? <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400"><Check aria-hidden="true" className="size-3.5 text-emerald-400" /> Enviar para {selectedContact.phone}</p> : <p className="mt-3 text-xs text-zinc-600">{searchingContacts ? "Buscando contatos…" : searchedContacts && !contacts.length && /[a-zÀ-ÿ]/i.test(phone) ? "Nenhum contato encontrado com esse nome." : "Sem contato salvo? Digite o número e continue."}</p>}
            </div>
          ) : step === 1 ? (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Qual mensagem?</h2>
              <p className="mt-2 text-sm text-zinc-500">Escreva exatamente o texto que será enviado.</p>
              <label className="mt-8 block text-sm text-zinc-400">Mensagem
                <textarea autoFocus required rows={5} maxLength={5000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Digite sua mensagem" className="mt-2 w-full resize-y rounded-xl bg-white/[0.045] px-4 py-3 text-base text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:bg-white/[0.07] focus:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-white/40" />
              </label>
              <p className="mt-1 text-right text-xs text-zinc-600">{content.length}/5000</p>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Quando enviar?</h2>
              <p className="mt-2 text-sm text-zinc-500">Escolha a data e o horário do envio.</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="text-sm text-zinc-400">Data<CalendarDatePicker value={date} onChange={setDate} /></div>
                <div className="text-sm text-zinc-400">Horário<CalendarTimePicker label="Horário" value={time} onChange={setTime} /></div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {error?.step === step && <p role="alert" className="mt-5 text-sm text-red-300">{error.message}</p>}
      <div className="mt-9 flex items-center justify-between gap-3">
        <button type="button" disabled={saving} onClick={() => { setError(null); if (step === 0) onBack(); else onStepChange(step - 1); }} className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-50"><ChevronLeft aria-hidden="true" className="size-4" /> Voltar</button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 disabled:opacity-50">
          {step === 2 ? <Send aria-hidden="true" className="size-4" /> : null}
          {saving ? "Programando…" : step === 2 ? "Programar mensagem" : "Continuar"}
          {step < 2 && <ChevronRight aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </form>
  );
}
