"use client";

import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function CalendarDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseDate(value);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const selected = parseDate(value);
  const today = new Date();
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  function selectDate(date: Date) {
    onChange(dateKey(date));
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
      setOpen(nextOpen);
    }}>
      <Popover.Trigger type="button" aria-label={`Data: ${fullDateFormatter.format(selected)}. Escolher data`} className="mt-1.5 flex h-10 w-full items-center justify-between rounded-lg bg-white/[0.035] px-3 text-left text-sm text-zinc-100 outline-none transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/35 data-[popup-open]:bg-white/[0.08]">
        <span>{dateFormatter.format(selected)}</span>
        <CalendarDays aria-hidden="true" className="size-4 text-zinc-500" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-[120]">
          <Popover.Popup data-calendar-date-popup className="w-[288px] max-w-[calc(100vw-24px)] origin-[var(--transform-origin)] rounded-xl border border-white/10 bg-zinc-900/95 p-3 text-zinc-100 shadow-[0_16px_40px_rgba(0,0,0,0.45)] outline-none backdrop-blur-xl transition-[opacity,transform] duration-150 data-[starting-style]:translate-y-[-4px] data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:translate-y-[-4px] data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0">
            <Popover.Title className="sr-only">Escolher data do evento</Popover.Title>
            <div className="mb-2 flex items-center justify-between gap-1">
              <button type="button" aria-label="Mês anterior" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"><ChevronLeft aria-hidden="true" className="size-4" /></button>
              <span aria-live="polite" className="text-sm font-semibold capitalize">{monthFormatter.format(visibleMonth)}</span>
              <button type="button" aria-label="Próximo mês" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"><ChevronRight aria-hidden="true" className="size-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {weekdays.map((day) => <span key={day} className="py-1 text-[11px] text-zinc-500">{day}</span>)}
              {Array.from({ length: cellCount }, (_, index) => {
                const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - firstWeekday + 1);
                const key = dateKey(date);
                const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                const isSelected = key === value;
                const isToday = key === dateKey(today);
                return <button key={key} type="button" aria-label={fullDateFormatter.format(date)} aria-pressed={isSelected} aria-current={isToday ? "date" : undefined} onClick={() => selectDate(date)} className={["flex size-8 items-center justify-center rounded-lg text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70", isSelected ? "bg-zinc-100 font-semibold text-zinc-950" : isCurrentMonth ? "text-zinc-200 hover:bg-white/[0.09]" : "text-zinc-600 hover:bg-white/[0.06]", isToday && !isSelected ? "ring-1 ring-inset ring-white/30" : ""].join(" ")}>{date.getDate()}</button>;
              })}
            </div>
            <div className="mt-2 flex justify-end border-t border-white/[0.07] pt-2">
              <button type="button" onClick={() => selectDate(today)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white">Hoje</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
