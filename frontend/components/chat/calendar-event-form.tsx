"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CalendarDatePicker } from "@/components/chat/calendar-date-picker";
import { CalendarTimePicker } from "@/components/chat/calendar-time-picker";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type CalendarEventCategory = "MEETING" | "TRAINING" | "DEADLINE" | "APPOINTMENT" | "OTHER";
export type CalendarEvent = {
  id: string;
  title: string;
  companyName: string | null;
  description: string | null;
  startsAt: string;
  endsAt: string;
  category: CalendarEventCategory;
  completedAt: string | null;
  creator: { name: string; image: string | null };
};

const categories: { value: CalendarEventCategory; label: string; color: string }[] = [
  { value: "MEETING", label: "Reunião", color: "bg-blue-400" },
  { value: "TRAINING", label: "Treinamento", color: "bg-emerald-400" },
  { value: "DEADLINE", label: "Prazo", color: "bg-amber-400" },
  { value: "APPOINTMENT", label: "Compromisso", color: "bg-violet-400" },
  { value: "OTHER", label: "Outro", color: "bg-zinc-400" },
];

const fieldClass = "mt-1.5 block h-10 w-full rounded-lg bg-white/[0.035] px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:bg-white/[0.07] focus:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/35 [color-scheme:dark]";
const labelClass = "block text-xs font-medium text-zinc-500";

export function CalendarEventForm({ date, onDateChange, onCancel, onCreated }: {
  date: string;
  onDateChange: (date: string) => void;
  onCancel: () => void;
  onCreated: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [category, setCategory] = useState<CalendarEventCategory>("OTHER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = new Date(date + "T" + startTime);
    const endsAt = new Date(date + "T" + endTime);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      setError("O horário de término precisa ser posterior ao início.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(API_URL + "/calendar-events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          companyName: companyName.trim(),
          description: description.trim(),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          category,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { event?: CalendarEvent; error?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error || "Não foi possível salvar o evento.");
      onCreated(payload.event);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o evento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <h3 className="pb-1 text-lg font-semibold text-zinc-100">Novo evento</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Título
          <input autoFocus required maxLength={191} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome do evento" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Empresa
          <input maxLength={191} value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Nome da empresa" className={fieldClass} />
        </label>
      </div>
      <label className={labelClass}>
        Descrição
        <textarea maxLength={5000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalhes do compromisso" className={fieldClass + " h-auto min-h-20 resize-y py-2.5"} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={labelClass}>Data
          <CalendarDatePicker value={date} onChange={onDateChange} />
        </div>
        <div className={labelClass}>Início
          <CalendarTimePicker label="Início" value={startTime} onChange={setStartTime} />
        </div>
        <div className={labelClass}>Término
          <CalendarTimePicker label="Término" value={endTime} onChange={setEndTime} />
        </div>
      </div>
      <Select.Root
        items={categories}
        value={category}
        onValueChange={(value) => { if (value) setCategory(value as CalendarEventCategory); }}
      >
        <div className="sm:max-w-56">
          <Select.Label className={labelClass}>Tipo</Select.Label>
          <Select.Trigger className={fieldClass + " group flex items-center gap-2 text-left data-[popup-open]:bg-white/[0.08]"}>
            <span aria-hidden="true" className={["size-2 shrink-0 rounded-full", categories.find((option) => option.value === category)?.color ?? "bg-zinc-400"].join(" ")} />
            <Select.Value className="min-w-0 flex-1" />
            <Select.Icon className="text-zinc-500"><ChevronDown aria-hidden="true" className="size-4 transition-transform duration-150 group-data-[popup-open]:rotate-180" /></Select.Icon>
          </Select.Trigger>
        </div>
        <Select.Portal>
          <Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="z-[120] w-[var(--anchor-width)]">
            <Select.Popup data-calendar-category-popup className="w-full origin-[var(--transform-origin)] rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 text-zinc-100 shadow-[0_16px_40px_rgba(0,0,0,0.45)] outline-none backdrop-blur-xl transition-[opacity,transform] duration-150 data-[starting-style]:translate-y-[-4px] data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:translate-y-[-4px] data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0">
              <Select.List className="max-h-64 overflow-y-auto">
                {categories.map((option) => (
                  <Select.Item key={option.value} value={option.value} className="flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-300 outline-none transition-colors data-[highlighted]:bg-white/[0.08] data-[selected]:text-white">
                    <span aria-hidden="true" className={["size-2 shrink-0 rounded-full", option.color].join(" ")} />
                    <Select.ItemText className="flex-1">{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="text-zinc-300"><Check aria-hidden="true" className="size-4" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Salvando…" : "Salvar evento"}</button>
      </div>
    </form>
  );
}
