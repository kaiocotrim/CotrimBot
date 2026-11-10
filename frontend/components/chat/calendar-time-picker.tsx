"use client";

import { Popover } from "@base-ui/react/popover";
import { Clock3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const itemHeight = 40;
const hours = Array.from({ length: 24 }, (_, index) => index);
const minutes = Array.from({ length: 60 }, (_, index) => index);

function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

export function CalendarTimePicker({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const openingValueRef = useRef(value);
  const [hour, minute] = value.split(":").map(Number);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const [initialHour, initialMinute] = openingValueRef.current.split(":").map(Number);
      if (hourListRef.current) hourListRef.current.scrollTop = initialHour * itemHeight;
      if (minuteListRef.current) minuteListRef.current.scrollTop = initialMinute * itemHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function updateTime(part: "hour" | "minute", next: number) {
    if (part === "hour" && next !== hour) onChange(`${twoDigits(next)}:${twoDigits(minute)}`);
    if (part === "minute" && next !== minute) onChange(`${twoDigits(hour)}:${twoDigits(next)}`);
  }

  function renderColumn(part: "hour" | "minute", options: number[], selected: number, listRef: React.RefObject<HTMLDivElement | null>) {
    return (
      <div
        ref={listRef}
        role="group"
        aria-label={part === "hour" ? "Horas" : "Minutos"}
        onScroll={(event) => {
          const next = Math.max(0, Math.min(options.length - 1, Math.round(event.currentTarget.scrollTop / itemHeight)));
          updateTime(part, next);
        }}
        className="relative z-10 h-[200px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-20 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: "linear-gradient(to bottom, transparent, black 26%, black 74%, transparent)" }}
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`${twoDigits(option)} ${part === "hour" ? "horas" : "minutos"}`}
            aria-pressed={selected === option}
            tabIndex={selected === option ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, option + (event.key === "ArrowDown" ? 1 : -1)));
              updateTime(part, next);
              listRef.current?.scrollTo({ top: next * itemHeight });
              listRef.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}
            onClick={() => {
              updateTime(part, option);
              listRef.current?.scrollTo({ top: option * itemHeight });
            }}
            className={["flex h-10 w-full snap-center items-center justify-center rounded-lg text-base tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/50", selected === option ? "font-semibold text-white" : "text-zinc-500 hover:text-zinc-200"].join(" ")}
          >
            {twoDigits(option)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) openingValueRef.current = value;
      setOpen(nextOpen);
    }}>
      <Popover.Trigger type="button" aria-label={`${label}: ${value}. Escolher horário`} className="mt-1.5 flex h-10 w-full items-center justify-between rounded-lg bg-white/[0.035] px-3 text-left text-sm text-zinc-100 outline-none transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/35 data-[popup-open]:bg-white/[0.08]">
        <span className="tabular-nums">{value}</span>
        <Clock3 aria-hidden="true" className="size-4 text-zinc-500" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-[120]">
          <Popover.Popup data-calendar-time-popup className="w-[232px] max-w-[calc(100vw-24px)] origin-[var(--transform-origin)] rounded-xl border border-white/10 bg-zinc-900/95 p-3 text-zinc-100 shadow-[0_16px_40px_rgba(0,0,0,0.45)] outline-none backdrop-blur-xl transition-[opacity,transform] duration-150 data-[starting-style]:translate-y-[-4px] data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:translate-y-[-4px] data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0">
            <Popover.Title className="sr-only">Escolher horário de {label.toLowerCase()}</Popover.Title>
            <div className="mb-1 grid grid-cols-[1fr_16px_1fr] text-center text-[11px] text-zinc-500"><span>Hora</span><span /><span>Minuto</span></div>
            <div className="relative grid grid-cols-[1fr_16px_1fr] items-center">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-lg border border-white/[0.08] bg-white/[0.07]" />
              {renderColumn("hour", hours, hour, hourListRef)}
              <span aria-hidden="true" className="relative z-10 text-center text-base font-semibold text-zinc-300">:</span>
              {renderColumn("minute", minutes, minute, minuteListRef)}
            </div>
            <div className="mt-1 flex justify-end border-t border-white/[0.07] pt-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white">Concluir</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
