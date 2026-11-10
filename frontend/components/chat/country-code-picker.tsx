"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

const regionNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });
const englishRegionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countrySort = new Intl.Collator("pt-BR", { sensitivity: "base" });

const countries = getCountries()
  .map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    englishName: englishRegionNames.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
    flag: [...code].map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397)).join(""),
  }))
  .sort((a, b) => countrySort.compare(a.name, b.name));

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function CountryCodePicker({ value, onChange }: { value: CountryCode; onChange: (value: CountryCode) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const selected = countries.find((country) => country.code === value);
  const visible = useMemo(() => {
    const search = normalizeSearch(query.trim());
    if (!search) return countries;
    const digitSearch = search.replace(/\D/g, "");
    return countries.filter((country) =>
      normalizeSearch(country.name).includes(search)
      || normalizeSearch(country.englishName).includes(search)
      || country.code.toLocaleLowerCase("pt-BR").includes(search)
      || (digitSearch.length > 0 && country.callingCode.startsWith(digitSearch)),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      list.scrollTop = query ? 0 : selectedRef.current?.offsetTop ?? 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, query]);

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
      <Popover.Trigger type="button" aria-label={`País, ${selected?.name ?? value}, código +${selected?.callingCode ?? ""}`} className="flex h-11 w-full items-center justify-between gap-1 text-left text-sm text-white outline-none">
        <span className="truncate">{value} +{selected?.callingCode}</span>
        <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-zinc-400" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <Popover.Popup data-country-code-popup initialFocus={searchRef} className="flex max-h-[min(440px,70dvh)] w-[280px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1b1b1b] p-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)] outline-none">
            <Popover.Title className="sr-only">Selecionar país e código</Popover.Title>
            <label className="mb-1.5 flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/25 bg-[#111111] px-3 text-zinc-400 focus-within:border-white/70">
              <Search aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
              <input ref={searchRef} type="search" aria-label="Pesquisar país ou código" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { listRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); event.preventDefault(); } }} placeholder="Pesquisar país ou código" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" />
            </label>
            <ul ref={listRef} aria-label="Países e códigos" onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
              const index = buttons.indexOf(event.target as HTMLButtonElement);
              buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
              event.preventDefault();
            }} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {visible.length === 0 && <li className="px-3 py-5 text-center text-sm text-zinc-500">Nenhum país encontrado</li>}
              {visible.map((country) => (
                <li key={country.code}>
                  <button ref={country.code === value ? selectedRef : undefined} type="button" aria-pressed={country.code === value} onClick={() => { onChange(country.code); setOpen(false); setQuery(""); }} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.09] focus-visible:outline-none ${country.code === value ? "bg-white/[0.09]" : ""}`}>
                    <span aria-hidden="true" className="w-5 shrink-0 text-base leading-none">{country.flag}</span>
                    <span className="min-w-0 flex-1 truncate">{country.name}</span>
                    <span className="shrink-0 text-xs text-zinc-400">+{country.callingCode}</span>
                    {country.code === value && <Check aria-hidden="true" className="size-4 shrink-0 text-white" strokeWidth={2} />}
                  </button>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
