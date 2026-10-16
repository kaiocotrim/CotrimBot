"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarPlus2, Check, ChevronLeft, ChevronRight, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarEventForm, type CalendarEvent, type CalendarEventCategory } from "@/components/chat/calendar-event-form";
import { ScheduledMessageWizard, type ScheduledMessage } from "@/components/chat/scheduled-message-wizard";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const shortWeekdays = ["S", "T", "Q", "Q", "S", "S", "D"];
const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, index, 1)));
const appleEase = [0.22, 1, 0.36, 1] as const;
type EventColor = "blue" | "green" | "amber" | "purple" | "gray";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const eventColor: Record<CalendarEventCategory, EventColor> = {
  MEETING: "blue",
  TRAINING: "green",
  DEADLINE: "amber",
  APPOINTMENT: "purple",
  OTHER: "gray",
};

const colors: Record<EventColor, { dot: string; text: string }> = {
  blue: { dot: "bg-blue-400", text: "text-blue-400" },
  green: { dot: "bg-emerald-400", text: "text-emerald-400" },
  amber: { dot: "bg-amber-400", text: "text-amber-400" },
  purple: { dot: "bg-violet-400", text: "text-violet-400" },
  gray: { dot: "bg-zinc-400", text: "text-zinc-400" },
};

type CalendarDeleteTarget =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "message"; message: ScheduledMessage };

function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function sentenceCase(value: string) {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function CreatorAvatar({ creator }: { creator: CalendarEvent["creator"] }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const name = creator?.name?.trim() || "Técnico";
  const image = creator?.image;
  return (
    <span title={`Criado por ${name}`} aria-label={`Criado por ${name}`} className="flex size-10 shrink-0 self-center items-center justify-center overflow-hidden rounded-full bg-white/[0.09] text-sm font-semibold text-zinc-300">
      {image && image !== failedImage ? (
        // A foto do perfil pode ser uma URL externa ou uma imagem em data URI.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" onError={() => setFailedImage(image)} className="size-full object-cover" />
      ) : name.charAt(0).toLocaleUpperCase("pt-BR")}
    </span>
  );
}

export function CalendarModal({ onClose, variant = "modal" }: { onClose: () => void; variant?: "modal" | "page" }) {
  const reduceMotion = useReducedMotion();
  const isPage = variant === "page";
  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 360, damping: 38, mass: 0.72 };
  const [today] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const [loadState, setLoadState] = useState<{ key: string; events: CalendarEvent[]; error: string | null }>({ key: "", events: [], error: null });
  const [messageLoadState, setMessageLoadState] = useState<{ key: string; messages: ScheduledMessage[]; error: string | null }>({ key: "", messages: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [choosingAction, setChoosingAction] = useState(false);
  const [schedulingMessage, setSchedulingMessage] = useState(false);
  const [schedulingStep, setSchedulingStep] = useState(0);
  const [updatingEventIds, setUpdatingEventIds] = useState<string[]>([]);
  const [deletingEventIds, setDeletingEventIds] = useState<string[]>([]);
  const [deletingMessageIds, setDeletingMessageIds] = useState<string[]>([]);
  const [calendarContextMenu, setCalendarContextMenu] = useState<{ target: CalendarDeleteTarget; x: number; y: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<CalendarDeleteTarget | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const monthHeadingRef = useRef<HTMLButtonElement>(null);
  const newEventButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusToNewEventRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPage) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, [isPage]);

  useEffect(() => {
    if (isPage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector("[data-calendar-delete-dialog]")) return;
        if (document.querySelector("[data-calendar-context-menu]")) return;
        if (event.defaultPrevented || document.querySelector("[data-calendar-date-popup], [data-calendar-time-popup], [data-calendar-category-popup]")) return;
        if (schedulingMessage) {
          if (schedulingStep > 0) setSchedulingStep(schedulingStep - 1);
          else {
            setSchedulingMessage(false);
            setChoosingAction(true);
          }
        } else if (choosingAction) {
          returnFocusToNewEventRef.current = true;
          setChoosingAction(false);
        } else if (creatingEvent) {
          returnFocusToNewEventRef.current = true;
          setCreatingEvent(false);
        } else if (monthPickerOpen) {
          setMonthPickerOpen(false);
          monthHeadingRef.current?.focus();
        } else {
          onClose();
        }
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])"))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, choosingAction, schedulingMessage, schedulingStep, creatingEvent, monthPickerOpen, isPage]);

  useEffect(() => {
    if (!completionNotice) return;
    const timeout = window.setTimeout(() => setCompletionNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [completionNotice]);

  useEffect(() => {
    if (!calendarContextMenu) return;
    const closeMenu = () => setCalendarContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [calendarContextMenu]);

  useEffect(() => {
    if (!deleteConfirmation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleteConfirmation(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [deleteConfirmation]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const dates = Array.from({ length: cellCount }, (_, index) => new Date(year, month, index - firstWeekday + 1));
  const monthKey = dateKey(visibleMonth);
  const requestKey = monthKey + ":" + reloadKey;
  const loadingEvents = loadState.key !== requestKey;
  const events = loadingEvents ? [] : loadState.events;
  const eventsError = loadingEvents ? null : loadState.error;
  const loadingMessages = messageLoadState.key !== requestKey;
  const scheduledMessages = loadingMessages ? [] : messageLoadState.messages;
  const messagesError = loadingMessages ? null : messageLoadState.error;
  const dayEvents = events
    .filter((event) => dateKey(new Date(event.startsAt)) === dateKey(selectedDate))
    .sort((first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime());
  const dayMessages = scheduledMessages.filter((message) => dateKey(new Date(message.scheduledAt)) === dateKey(selectedDate));
  const dayItems = [
    ...dayEvents.map((event) => ({ kind: "event" as const, at: event.startsAt, event })),
    ...dayMessages.map((message) => ({ kind: "message" as const, at: message.scheduledAt, message })),
  ].sort((first, second) => new Date(first.at).getTime() - new Date(second.at).getTime());

  useEffect(() => {
    const controller = new AbortController();
    const from = new Date(year, month, 1 - firstWeekday);
    const to = new Date(year, month, cellCount - firstWeekday + 1);
    fetch(API_URL + "/calendar-events?from=" + encodeURIComponent(from.toISOString()) + "&to=" + encodeURIComponent(to.toISOString()), {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { events?: CalendarEvent[]; error?: string };
        if (!response.ok || !Array.isArray(payload.events)) throw new Error(payload.error || "Não foi possível carregar os compromissos.");
        if (!controller.signal.aborted) setLoadState({ key: requestKey, events: payload.events, error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState({ key: requestKey, events: [], error: cause instanceof Error ? cause.message : "Não foi possível carregar os compromissos." });
      });
    return () => controller.abort();
  }, [year, month, firstWeekday, cellCount, requestKey]);

  useEffect(() => {
    const controller = new AbortController();
    const from = new Date(year, month, 1 - firstWeekday);
    const to = new Date(year, month, cellCount - firstWeekday + 1);
    const url = `${API_URL}/scheduled-messages?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    async function loadMessages() {
      try {
        const response = await fetch(url, { credentials: "include", cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => ({})) as { messages?: ScheduledMessage[]; error?: string };
        if (!response.ok || !Array.isArray(payload.messages)) throw new Error(payload.error || "Não foi possível carregar as mensagens programadas.");
        if (!controller.signal.aborted) setMessageLoadState({ key: requestKey, messages: payload.messages, error: null });
      } catch (cause) {
        if (!controller.signal.aborted) setMessageLoadState({ key: requestKey, messages: [], error: cause instanceof Error ? cause.message : "Não foi possível carregar as mensagens programadas." });
      }
    }
    void loadMessages();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void loadMessages(); }, 30_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [year, month, firstWeekday, cellCount, requestKey]);

  const handleCreated = (event: CalendarEvent) => {
    const eventDate = new Date(event.startsAt);
    setLoadState((current) => ({ ...current, events: [...current.events, event] }));
    setSelectedDate(new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()));
    if (eventDate.getFullYear() !== year || eventDate.getMonth() !== month) {
      setVisibleMonth(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
    }
    setCreatingEvent(false);
  };

  const toggleCompleted = async (event: CalendarEvent) => {
    if (updatingEventIds.includes(event.id)) return;
    const completed = !event.completedAt;
    setCompletionError(null);
    setCompletionNotice(null);
    setUpdatingEventIds((current) => [...current, event.id]);
    setLoadState((current) => ({
      ...current,
      events: current.events.map((item) => item.id === event.id ? { ...item, completedAt: completed ? new Date().toISOString() : null } : item),
    }));
    try {
      const response = await fetch(`${API_URL}/calendar-events/${encodeURIComponent(event.id)}/completed`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const payload = await response.json().catch(() => ({})) as { event?: CalendarEvent; error?: string };
      const updatedEvent = payload.event;
      if (!response.ok || !updatedEvent) throw new Error(payload.error || "Não foi possível atualizar o compromisso.");
      setLoadState((current) => ({ ...current, events: current.events.map((item) => item.id === event.id ? updatedEvent : item) }));
      setCompletionNotice(completed ? "Tarefa concluída" : "Tarefa marcada como pendente");
    } catch (cause) {
      setLoadState((current) => ({ ...current, events: current.events.map((item) => item.id === event.id ? event : item) }));
      setCompletionError(cause instanceof Error ? cause.message : "Não foi possível atualizar o compromisso.");
    } finally {
      setUpdatingEventIds((current) => current.filter((id) => id !== event.id));
    }
  };

  const deleteScheduledMessage = async (message: ScheduledMessage) => {
    if (deletingMessageIds.includes(message.id)) return;
    setDeleteConfirmation(null);
    setCalendarContextMenu(null);
    setCompletionError(null);
    setCompletionNotice(null);
    setDeletingMessageIds((current) => [...current, message.id]);
    try {
      const response = await fetch(`${API_URL}/scheduled-messages/${encodeURIComponent(message.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a mensagem.");
      setMessageLoadState((current) => ({ ...current, messages: current.messages.filter((item) => item.id !== message.id) }));
      setCompletionNotice("Mensagem removida do calendário");
    } catch (cause) {
      setCompletionError(cause instanceof Error ? cause.message : "Não foi possível excluir a mensagem.");
    } finally {
      setDeletingMessageIds((current) => current.filter((id) => id !== message.id));
    }
  };

  const deleteEvent = async (event: CalendarEvent) => {
    if (deletingEventIds.includes(event.id)) return;
    setDeleteConfirmation(null);
    setCalendarContextMenu(null);
    setCompletionError(null);
    setCompletionNotice(null);
    setDeletingEventIds((current) => [...current, event.id]);
    try {
      const response = await fetch(`${API_URL}/calendar-events/${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o compromisso.");
      setLoadState((current) => ({ ...current, events: current.events.filter((item) => item.id !== event.id) }));
      setCompletionNotice("Compromisso excluído");
    } catch (cause) {
      setCompletionError(cause instanceof Error ? cause.message : "Não foi possível excluir o compromisso.");
    } finally {
      setDeletingEventIds((current) => current.filter((id) => id !== event.id));
    }
  };

  const changeMonth = (offset: number) => {
    if (monthPickerOpen) {
      setPickerYear((current) => current + offset);
      return;
    }
    const nextMonth = new Date(year, month + offset, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate(nextMonth);
  };
  const goToToday = () => {
    const current = new Date();
    setMonthPickerOpen(false);
    setSelectedDate(new Date(current.getFullYear(), current.getMonth(), current.getDate()));
    setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1));
  };

  const selectMonth = (selectedMonth: number) => {
    if (pickerYear !== year || selectedMonth !== month) {
      const nextMonth = new Date(pickerYear, selectedMonth, 1);
      setVisibleMonth(nextMonth);
      setSelectedDate(nextMonth);
    }
    setMonthPickerOpen(false);
  };

  const contextTargetDeleting = calendarContextMenu?.target.kind === "event"
    ? deletingEventIds.includes(calendarContextMenu.target.event.id)
    : calendarContextMenu?.target.kind === "message"
      ? deletingMessageIds.includes(calendarContextMenu.target.message.id)
      : false;
  const contextTargetProcessing = calendarContextMenu?.target.kind === "message" && calendarContextMenu.target.message.status === "PROCESSING";
  const deleteDialogTitle = deleteConfirmation?.kind === "event" ? "Excluir compromisso?" : "Excluir mensagem?";
  const deleteDialogDescription = !deleteConfirmation
    ? ""
    : deleteConfirmation.kind === "event"
      ? "Este compromisso será removido permanentemente do calendário."
      : deleteConfirmation.message.status === "SENT"
        ? "Ela será removida apenas do calendário. A mensagem já enviada continuará no WhatsApp."
        : deleteConfirmation.message.status === "PENDING"
          ? "A mensagem programada será removida e não será enviada."
          : "O registro desta mensagem será removido do calendário.";

  const calendarPanel = (
      <motion.div
        ref={dialogRef}
        layout={!reduceMotion}
        role={isPage ? "region" : "dialog"}
        tabIndex={isPage ? undefined : -1}
        aria-modal={isPage ? undefined : "true"}
        aria-label={schedulingMessage ? "Programar mensagem" : choosingAction || creatingEvent ? "Novo evento" : "Calendário"}
        initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.992, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.995, filter: "blur(5px)" }}
        transition={{ duration: reduceMotion ? 0 : 0.34, ease: appleEase, layout: layoutTransition }}
        className={isPage
          ? "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950 text-zinc-100"
          : ["relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:max-h-[calc(100dvh-2.5rem)]", choosingAction ? "max-w-[540px]" : schedulingMessage ? "max-w-[620px]" : creatingEvent ? "max-w-[1080px]" : "max-w-[1180px]"].join(" ")}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {choosingAction ? (
            <motion.div layout={!reduceMotion} key="event-actions" initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.99, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.995, filter: "blur(4px)" }} transition={{ duration: reduceMotion ? 0 : 0.34, ease: appleEase, layout: layoutTransition }} className="flex min-h-0 flex-1 items-center justify-center px-5 py-8 sm:px-8">
              <div role="group" aria-label="Opções para novo evento" className="flex w-full max-w-md flex-col gap-3">
                <button autoFocus type="button" onClick={() => { setSchedulingStep(0); setChoosingAction(false); setSchedulingMessage(true); }} className="flex min-h-28 items-center gap-4 rounded-2xl bg-white/[0.045] p-5 text-left transition-colors hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50">
                  <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-zinc-300"><MessageSquareText className="size-5" strokeWidth={1.8} /></span>
                  <span className="min-w-0"><strong className="block text-base font-semibold text-zinc-100">Programar mensagem</strong><span className="mt-1 block text-sm text-zinc-500">Escolha o número, o texto e o horário</span></span>
                </button>
                <button type="button" onClick={() => { setChoosingAction(false); setCreatingEvent(true); }} className="flex min-h-28 items-center gap-4 rounded-2xl bg-white/[0.045] p-5 text-left transition-colors hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50">
                  <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-zinc-300"><CalendarPlus2 className="size-5" strokeWidth={1.8} /></span>
                  <span className="min-w-0"><strong className="block text-base font-semibold text-zinc-100">Criar evento</strong><span className="mt-1 block text-sm text-zinc-500">Adicionar compromisso ao calendário</span></span>
                </button>
              </div>
            </motion.div>
          ) : schedulingMessage ? (
            <motion.div layout={!reduceMotion} key="schedule-message" initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.99, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.995, filter: "blur(4px)" }} transition={{ duration: reduceMotion ? 0 : 0.34, ease: appleEase, layout: layoutTransition }} className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto py-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ScheduledMessageWizard
                step={schedulingStep}
                onStepChange={setSchedulingStep}
                onBack={() => { setSchedulingMessage(false); setChoosingAction(true); }}
                onScheduled={(message) => {
                  const scheduledAt = new Date(message.scheduledAt);
                  returnFocusToNewEventRef.current = true;
                  setSchedulingMessage(false);
                  setSelectedDate(new Date(scheduledAt.getFullYear(), scheduledAt.getMonth(), scheduledAt.getDate()));
                  setVisibleMonth(new Date(scheduledAt.getFullYear(), scheduledAt.getMonth(), 1));
                  setReloadKey((current) => current + 1);
                  setCompletionNotice(`Mensagem programada para ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(scheduledAt)}.`);
                }}
              />
            </motion.div>
          ) : (
        <motion.div layout={!reduceMotion} key="calendar-content" initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.995, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.997, filter: "blur(4px)" }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: appleEase, layout: layoutTransition }} onAnimationComplete={() => { if (returnFocusToNewEventRef.current) { newEventButtonRef.current?.focus(); returnFocusToNewEventRef.current = false; } }} className={["min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:overflow-hidden", isPage ? "gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(380px,0.94fr)_minmax(0,1.06fr)] lg:p-4" : "lg:grid-cols-[0.96fr_1.04fr]", creatingEvent ? "lg:items-center" : ""].join(" ")}>
          <section aria-label="Calendário mensal" className={isPage ? "flex min-w-0 flex-col p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-5 lg:min-h-0 lg:justify-center lg:overflow-y-auto" : "min-w-0 px-4 pb-6 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-7 lg:max-h-full lg:overflow-y-auto lg:px-8 lg:pb-5 lg:pt-3"}>
            <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <button type="button" aria-label={monthPickerOpen ? "Ano anterior" : "Mês anterior"} onClick={() => changeMonth(-1)} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 lg:size-11">
                <ChevronLeft aria-hidden="true" className="size-5" />
              </button>
              <h3 className="text-center text-base font-semibold text-zinc-100 lg:text-lg">
                <button ref={monthHeadingRef} type="button" aria-expanded={monthPickerOpen} aria-label={monthPickerOpen ? "Voltar aos dias do mês" : "Escolher mês"} onClick={() => { setPickerYear(year); setMonthPickerOpen((current) => !current); }} className="inline-flex items-center gap-1.5 bg-transparent px-1 py-1 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-white/50">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={monthPickerOpen ? `year-${pickerYear}` : monthKey} className="block" aria-live="polite" initial={reduceMotion ? false : { opacity: 0, y: 4, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: "blur(3px)" }} transition={{ duration: reduceMotion ? 0 : 0.26, ease: appleEase }}>
                      {monthPickerOpen ? pickerYear : sentenceCase(new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(visibleMonth))}
                    </motion.span>
                  </AnimatePresence>
                </button>
              </h3>
              <div className="flex shrink-0 items-center justify-self-end">
                <button type="button" aria-label={monthPickerOpen ? "Próximo ano" : "Próximo mês"} onClick={() => changeMonth(1)} className="flex size-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/50 lg:size-11">
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              </div>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              {monthPickerOpen ? (
                <motion.div key={`months-${pickerYear}`} id="calendar-month-grid" aria-label={`Meses de ${pickerYear}`} initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.992, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.996, filter: "blur(4px)" }} transition={{ duration: reduceMotion ? 0 : 0.34, ease: appleEase }} className="grid origin-center grid-cols-2 gap-2 pt-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
                  {monthNames.map((name, index) => {
                    const isSelected = pickerYear === year && index === month;
                    const isCurrent = pickerYear === today.getFullYear() && index === today.getMonth();
                    const firstDay = (new Date(pickerYear, index, 1).getDay() + 6) % 7;
                    const daysInMiniMonth = new Date(pickerYear, index + 1, 0).getDate();
                    return (
                      <button key={name} type="button" aria-label={`${name} de ${pickerYear}`} aria-pressed={isSelected} onClick={() => selectMonth(index)} className={["min-w-0 rounded-xl bg-transparent p-2 text-center transition-[color,transform] duration-150 hover:scale-[1.02] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70 sm:p-2.5", isSelected ? "text-white" : "text-zinc-300 hover:text-white"].join(" ")}>
                        <span className="relative mb-1.5 flex items-center justify-center gap-1 truncate text-xs font-semibold capitalize sm:text-sm">
                          {name}
                          {isCurrent && <span aria-hidden="true" className="absolute right-0 size-1.5 rounded-full bg-white/70" />}
                        </span>
                        <span aria-hidden="true" className="grid grid-cols-7 gap-y-0.5 text-center text-[9px] leading-4 tabular-nums sm:text-[10px]">
                          {shortWeekdays.map((day, dayIndex) => <span key={dayIndex} className="text-zinc-500">{day}</span>)}
                          {Array.from({ length: 42 }, (_, cellIndex) => {
                            const day = cellIndex - firstDay + 1;
                            const inMonth = day >= 1 && day <= daysInMiniMonth;
                            const isToday = isCurrent && day === today.getDate();
                            const isSelectedDay = isSelected && day === selectedDate.getDate();
                            return <span key={cellIndex} className={["flex h-4 items-center justify-center", !inMonth ? "" : isToday || isSelectedDay ? "font-semibold text-white underline decoration-white/60 underline-offset-2" : "text-zinc-300"].join(" ")}>{inMonth ? day : ""}</span>;
                          })}
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              ) : (
              <motion.div key={monthKey} initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.992, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.996, filter: "blur(4px)" }} transition={{ duration: reduceMotion ? 0 : 0.34, ease: appleEase }} className="grid origin-center grid-cols-7 gap-[6px] text-center">
              {weekdays.map((day) => <span key={day} className="py-2 text-xs text-zinc-400 sm:text-sm">{day}</span>)}
              {dates.map((date) => {
                const key = dateKey(date);
                const isCurrentMonth = date.getMonth() === month;
                const isSelected = key === dateKey(selectedDate);
                const isToday = key === dateKey(today);
                const eventColors = [...new Set(events.filter((event) => dateKey(new Date(event.startsAt)) === key).map((event) => eventColor[event.category]))];
                const hasScheduledMessage = scheduledMessages.some((message) => dateKey(new Date(message.scheduledAt)) === key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(date)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => { setSelectedDate(date); if (!isCurrentMonth) setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}
                    className={["flex aspect-square min-h-0 flex-col items-center justify-center gap-1 rounded-xl bg-transparent text-sm transition-[background-color,color,transform] duration-200 ease-out hover:scale-[1.025] active:scale-[0.975] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70 sm:text-base lg:aspect-auto", isPage ? "lg:h-[clamp(40px,6dvh,56px)]" : "lg:h-[clamp(44px,calc(16.667dvh_-_57.333px),76px)]", isSelected ? "font-semibold text-white" : isCurrentMonth ? "text-zinc-300 hover:text-white" : "text-zinc-600 hover:text-zinc-400", isToday ? "hover:bg-white/[0.16]" : "hover:bg-white/[0.055]", isToday && !isSelected ? "font-semibold text-zinc-100" : ""].join(" ")}
                  >
                    <span className={isSelected ? "underline decoration-white/60 decoration-2 underline-offset-[7px]" : ""}>{date.getDate()}</span>
                    {(eventColors.length > 0 || hasScheduledMessage) && <span aria-hidden="true" className="flex gap-[3px]">{eventColors.map((color) => <span key={color} className={["size-[7px] rounded-full sm:size-[9px]", colors[color].dot].join(" ")} />)}{hasScheduledMessage && <span className="size-[7px] rounded-full bg-zinc-300 sm:size-[9px]" />}</span>}
                  </button>
                );
              })}
              </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section aria-label="Compromissos do dia" className={isPage ? "flex min-w-0 flex-col p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-5 lg:min-h-0 lg:overflow-y-auto" : "min-w-0 px-4 pb-6 pt-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-7 lg:max-h-full lg:overflow-y-auto lg:px-8 lg:pb-7"}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={creatingEvent ? "new-event" : dateKey(selectedDate)} initial={reduceMotion ? false : { opacity: 0, y: 7, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5, filter: "blur(4px)" }} transition={{ duration: reduceMotion ? 0 : 0.3, ease: appleEase }} className={isPage ? "flex min-h-0 flex-1 flex-col" : undefined}>
            {creatingEvent ? (
              <CalendarEventForm
                date={dateKey(selectedDate)}
                onDateChange={(value) => {
                  const date = new Date(value + "T00:00:00");
                  if (!Number.isFinite(date.getTime())) return;
                  setSelectedDate(date);
                  if (date.getFullYear() !== year || date.getMonth() !== month) {
                    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                  }
                }}
                onCancel={() => setCreatingEvent(false)}
                onCreated={handleCreated}
              />
            ) : <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold sm:text-lg">{sentenceCase(new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(selectedDate))}</h3>
                <p className="mt-0.5 text-sm text-zinc-400">{dayEvents.length} {dayEvents.length === 1 ? "compromisso" : "compromissos"}{dayMessages.length > 0 && ` · ${dayMessages.length} ${dayMessages.length === 1 ? "mensagem" : "mensagens"}`}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={goToToday} className="flex h-10 items-center rounded-lg px-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">Hoje</button>
                <button ref={newEventButtonRef} type="button" aria-label="Novo evento" title="Novo evento" onClick={() => { setCompletionNotice(null); setChoosingAction(true); }} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">
                  <Plus aria-hidden="true" className="size-6" />
                </button>
              </div>
            </div>
            {completionError && <p role="alert" className="mb-3 text-sm text-red-300">{completionError}</p>}
            {loadingEvents || loadingMessages ? (
              <p role="status" className={isPage ? "flex min-h-64 flex-1 items-center justify-center py-10 text-center text-sm text-zinc-500" : "py-10 text-center text-sm text-zinc-500"}>Carregando calendário…</p>
            ) : eventsError || messagesError ? (
              <div role="alert" className="rounded-xl border border-red-400/15 bg-red-500/[0.06] p-4 text-sm text-red-300">
                <p>{eventsError || messagesError}</p>
                <button type="button" onClick={() => setReloadKey((current) => current + 1)} className="mt-3 font-medium underline underline-offset-2">Tentar novamente</button>
              </div>
            ) : dayItems.length > 0 ? (
              <div className="space-y-3">
                {dayItems.map((item) => {
                  if (item.kind === "message") {
                    const message = item.message;
                    const status = message.status === "SENT" ? "Mensagem enviada" : message.status === "FAILED" ? "Falha no envio" : message.status === "PROCESSING" ? "Enviando mensagem" : "Envio programado";
                    return (
                      <div
                        key={`message-${message.id}`}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setCalendarContextMenu({
                            target: { kind: "message", message },
                            x: Math.min(Math.max(8, event.clientX), window.innerWidth - 200),
                            y: Math.min(Math.max(8, event.clientY), window.innerHeight - 72),
                          });
                        }}
                        className={`flex min-h-24 cursor-context-menu items-start gap-3.5 rounded-2xl bg-white/[0.04] p-4 transition-opacity lg:min-h-28 ${deletingMessageIds.includes(message.id) ? "opacity-50" : ""}`}
                      >
                        <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-300"><MessageSquareText className="size-4" strokeWidth={1.8} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
                            <span>{formatTime(message.scheduledAt)}</span>
                            <span aria-hidden="true">·</span>
                            <span className={message.status === "FAILED" ? "text-red-300" : message.status === "SENT" ? "text-emerald-300" : "text-zinc-400"}>{status}</span>
                          </div>
                          <p className="mt-1 font-semibold leading-snug text-zinc-100">Mensagem para {message.contactName || message.phone}</p>
                          {message.contactName && <p className="mt-0.5 text-xs text-zinc-500">{message.phone}</p>}
                          <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-snug text-zinc-400">{message.content}</p>
                        </div>
                      </div>
                    );
                  }
                  const event = item.event;
                  const color = eventColor[event.category];
                  const completed = Boolean(event.completedAt);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      aria-label={`${completed ? "Marcar como pendente" : "Concluir tarefa"}: ${event.title}`}
                      aria-pressed={completed}
                      title={completed ? "Marcar como pendente" : "Concluir tarefa"}
                      disabled={updatingEventIds.includes(event.id) || deletingEventIds.includes(event.id)}
                      onClick={() => void toggleCompleted(event)}
                      onContextMenu={(contextEvent) => {
                        contextEvent.preventDefault();
                        setCalendarContextMenu({
                          target: { kind: "event", event },
                          x: Math.min(Math.max(8, contextEvent.clientX), window.innerWidth - 200),
                          y: Math.min(Math.max(8, contextEvent.clientY), window.innerHeight - 72),
                        });
                      }}
                      className="flex min-h-24 w-full cursor-pointer items-start gap-3.5 rounded-2xl bg-white/[0.04] p-4 text-left outline-none transition-[background-color,transform,opacity] hover:bg-white/[0.075] active:scale-[0.995] focus-visible:bg-white/[0.075] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-wait disabled:opacity-50 lg:min-h-28"
                    >
                      <motion.span
                        key={completed ? "completed" : "pending"}
                        aria-hidden="true"
                        initial={reduceMotion ? false : { scale: 0.82, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 32, mass: 0.55 }}
                        className={["mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", completed ? `${colors[color].dot} text-zinc-950` : "bg-white/[0.08]"].join(" ")}
                      >
                        {completed ? <Check className="size-3.5" strokeWidth={3} /> : <span className={["size-2 rounded-full", colors[color].dot].join(" ")} />}
                      </motion.span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
                          <span>{formatTime(event.startsAt)} – {formatTime(event.endsAt)}</span>
                          {completed && <span className={["font-medium", colors[color].text].join(" ")}>Tarefa concluída</span>}
                        </span>
                        <span className="mt-1 block font-semibold leading-snug text-zinc-100">{event.title}</span>
                        {event.companyName && <span className="mt-0.5 block text-sm leading-snug text-zinc-300">{event.companyName}</span>}
                        {event.description && <span className="mt-0.5 block text-sm leading-snug text-zinc-500">{event.description}</span>}
                      </span>
                      <CreatorAvatar creator={event.creator} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={isPage ? "flex min-h-64 flex-1 flex-col items-center justify-center px-5 text-center" : "flex min-h-64 flex-col items-center justify-center px-5 text-center"}>
                <p className="font-medium text-zinc-200">Nada programado para este dia</p>
                <p className="mt-1 text-sm text-zinc-500">Clique em + para criar um compromisso ou programar uma mensagem.</p>
              </div>
            )}
            </>}
              </motion.div>
            </AnimatePresence>
          </section>
        </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {completionNotice && (
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: 6, scale: 0.99, filter: "blur(3px)" }} transition={{ duration: reduceMotion ? 0 : 0.3, ease: appleEase }} className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
              <p role="status" className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 shadow-lg">
                {completionNotice}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {calendarContextMenu && createPortal(
          <motion.div
            data-calendar-context-menu
            role="menu"
            aria-label="Ações do item do calendário"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -4, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: appleEase }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            style={{ left: calendarContextMenu.x, top: calendarContextMenu.y }}
            className="fixed z-[200] w-48 rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 text-sm text-zinc-100 shadow-[0_14px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <button
              autoFocus
              type="button"
              role="menuitem"
              disabled={contextTargetDeleting || contextTargetProcessing}
              onClick={() => {
                setDeleteConfirmation(calendarContextMenu.target);
                setCalendarContextMenu(null);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:bg-red-500/10 focus-visible:outline-none disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.8} />
              {contextTargetDeleting
                ? "Excluindo…"
                : contextTargetProcessing
                  ? "Envio em andamento"
                  : "Excluir"}
            </button>
          </motion.div>,
          document.body,
        )}
        {deleteConfirmation && createPortal(
          <motion.div
            data-calendar-delete-dialog
            role="presentation"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: appleEase }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDeleteConfirmation(null);
            }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]"
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-calendar-item-title"
              aria-describedby="delete-calendar-item-description"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.975, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: appleEase }}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
                const first = buttons[0];
                const last = buttons.at(-1);
                if (!first || !last) return;
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }}
              className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-zinc-900 p-5 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:p-6"
            >
              <div className="flex items-start gap-3.5">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-300">
                  <Trash2 className="size-[18px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <h2 id="delete-calendar-item-title" className="text-base font-semibold">{deleteDialogTitle}</h2>
                  <p id="delete-calendar-item-description" className="mt-1.5 text-sm leading-relaxed text-zinc-400">{deleteDialogDescription}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  autoFocus
                  type="button"
                  onClick={() => setDeleteConfirmation(null)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (deleteConfirmation.kind === "event") void deleteEvent(deleteConfirmation.event);
                    else void deleteScheduledMessage(deleteConfirmation.message);
                  }}
                  className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-red-400 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>,
          document.body,
        )}
      </motion.div>
  );

  if (isPage) {
    return <div className="flex min-h-0 flex-1 overflow-hidden">{calendarPanel}</div>;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5" role="presentation">
      <motion.button type="button" aria-label="Fechar calendário" className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-[2px]" onClick={onClose} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: appleEase }} />
      {calendarPanel}
    </div>,
    document.body,
  );
}
