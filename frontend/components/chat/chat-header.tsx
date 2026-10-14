"use client";

import { ArrowLeft, CheckCheck, EllipsisVertical, Forward, Info, Search, Star, Trash2, UserRoundCheck, UserRoundPlus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Contact } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";
import styles from "./chat-header.module.css";

type ChatHeaderProps = {
  contact: Contact;
  currentUserId: string;
  onSetContactAssignment: (contactId: number, assignedUserIds: string[]) => Promise<void>;
  isTyping: boolean;
  searchOpen: boolean;
  searchQuery: string;
  currentResult: number;
  resultCount: number;
  selectionMode: boolean;
  selectedCount: number;
  selectionBusy: boolean;
  onOpenSearch: () => void;
  onStartSelection: () => void;
  onCloseSelection: () => void;
  onFavoriteSelected: () => void;
  onDeleteSelected: () => void;
  onOpenForward: () => void;
  onOpenContactInfo: () => void;
  onSearchQueryChange: (value: string) => void;
  onPreviousResult: () => void;
  onNextResult: () => void;
  onCloseSearch: () => void;
  onOpenSidebar: () => void;
  sidebarOpen: boolean;
};

// No mobile, volta do chat para a tela completa de conversas.
export function SidebarMenuButton({ onClick, expanded, className = "" }: { onClick: () => void; expanded: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Voltar para conversas"
      aria-controls="chat-sidebar"
      aria-expanded={expanded}
      title="Voltar para conversas"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50 lg:hidden ${className}`}
    >
      <ArrowLeft className="size-5" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

const actionClass = "flex size-10 shrink-0 items-center sm:size-9 justify-center rounded-full transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50 disabled:opacity-35";

export function ChatHeader({ contact, currentUserId, onSetContactAssignment, isTyping, searchOpen, searchQuery, currentResult, resultCount, selectionMode, selectedCount, selectionBusy, onOpenSearch, onStartSelection, onCloseSelection, onFavoriteSelected, onDeleteSelected, onOpenForward, onOpenContactInfo, onSearchQueryChange, onPreviousResult, onNextResult, onCloseSearch, onOpenSidebar, sidebarOpen }: ChatHeaderProps) {
  const reduceMotion = useReducedMotion();
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const assignedUserIds = contact.assignedUserIds ?? [];
  const assignedToMe = assignedUserIds.includes(currentUserId);

  async function toggleAssignment() {
    if (assigning) return;
    setAssigning(true);
    setAssignmentError(null);
    try {
      await onSetContactAssignment(
        contact.id,
        assignedToMe
          ? assignedUserIds.filter((assignedUserId) => assignedUserId !== currentUserId)
          : [...assignedUserIds, currentUserId],
      );
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Não foi possível alterar o responsável.");
    } finally {
      setAssigning(false);
    }
  }

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function closeMenu(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeMenuWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeMenuWithKeyboard);
    };
  }, [menuOpen]);

  return (
    <header className="pointer-events-auto relative isolate flex h-[calc(64px+env(safe-area-inset-top))] w-full min-w-0 items-center gap-1.5 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 sm:gap-3 sm:px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[200px] backdrop-blur-3xl backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,black_0%,black_35%,rgba(0,0,0,0.75)_55%,rgba(0,0,0,0.3)_78%,transparent_100%)]"
        style={{
          backgroundImage: "radial-gradient(ellipse at 25% 0%, rgba(0,0,0,0.08), transparent 70%), linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.42) 35%, rgba(0,0,0,0.22) 60%, rgba(0,0,0,0.06) 82%, transparent 100%)",
        }}
      />
      {selectionMode ? (
        <>
          <button type="button" onClick={onCloseSelection} aria-label="Sair da seleção" title="Sair da seleção" className={actionClass}>
            <X className="size-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <strong className="block text-sm font-semibold text-zinc-100">
              {selectedCount} {selectedCount === 1 ? "item selecionado" : "itens selecionados"}
            </strong>
            {!selectedCount && <span className="block text-xs text-zinc-400">Toque nas mensagens que deseja selecionar</span>}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 text-zinc-300">
            <button type="button" onClick={onFavoriteSelected} disabled={!selectedCount || selectionBusy} aria-label="Favoritar mensagens selecionadas" title="Favoritar" className={actionClass}>
              <Star className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button type="button" onClick={onDeleteSelected} disabled={!selectedCount || selectionBusy} aria-label="Excluir mensagens selecionadas" title="Excluir" className={actionClass}>
              <Trash2 className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpenForward} disabled={!selectedCount || selectionBusy} aria-label="Encaminhar mensagens selecionadas" title="Encaminhar" className={actionClass}>
              <Forward className="size-[19px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </>
      ) : searchOpen ? (
        <>
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3">
            <svg className="size-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input ref={searchRef} type="search" value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Localizar mensagem..." className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-zinc-500 lg:text-sm" />
          </label>
          <span className="shrink-0 text-xs tabular-nums text-zinc-400">{resultCount ? currentResult + 1 : 0}/{resultCount}</span>
          <button type="button" onClick={onPreviousResult} disabled={!resultCount} aria-label="Resultado anterior" className={actionClass}>↑</button>
          <button type="button" onClick={onNextResult} disabled={!resultCount} aria-label="Próximo resultado" className={actionClass}>↓</button>
          <button type="button" onClick={onCloseSearch} aria-label="Fechar busca" className={actionClass}>✕</button>
        </>
      ) : (
        <>
          <SidebarMenuButton onClick={onOpenSidebar} expanded={sidebarOpen} />
          <button type="button" onClick={onOpenContactInfo} aria-label={`Abrir informações de ${contact.name}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl sm:gap-3 text-left focus-visible:outline-2 focus-visible:outline-white/50">
            <Avatar contact={contact} className="size-10" />
            <span key={contact.id} className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium lg:text-[15px]">{contact.name}</span>
              {isTyping
                ? <span role="status" aria-label={`${contact.name} está digitando`} className="block h-4 truncate text-[13px] text-zinc-300 lg:text-xs">digitando…</span>
                : <span className={`${styles.subtitle} block truncate text-[13px] text-zinc-400 lg:text-xs`}>{contact.isGroup ? "Grupo do WhatsApp" : contact.phone}</span>}
            </span>
          </button>
          <div className="ml-auto flex h-11 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.035] px-1">
            {!contact.isGroup && <button
              type="button"
              onClick={() => void toggleAssignment()}
              disabled={assigning}
              aria-label={assignedToMe ? "Deixar de acompanhar conversa" : "Acompanhar conversa"}
              title={assignedToMe ? "Você acompanha esta conversa · clique para sair" : assignedUserIds.length ? "Acompanhar junto com os outros responsáveis" : "Assumir conversa para aparecer em Minhas"}
              className={`${actionClass} ${assignedToMe ? "text-white" : "text-zinc-300"}`}
            >
              {assignedToMe ? <UserRoundCheck className="size-5" aria-hidden="true" /> : <UserRoundPlus className="size-5" aria-hidden="true" />}
            </button>}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Mais opções"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Mais opções"
                className={actionClass}
              >
                <EllipsisVertical className="size-5" strokeWidth={2} aria-hidden="true" />
              </button>
              <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -3, scale: 0.99 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: "top right" }}
                  className="absolute top-[calc(100%+0.55rem)] right-0 z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 text-sm shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onStartSelection(); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50"
                  >
                    <CheckCheck className="size-4 text-zinc-400" aria-hidden="true" />
                    Selecionar mensagens
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onOpenSearch(); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-white/50"
                  >
                    <Search className="size-4 text-zinc-400" aria-hidden="true" />
                    Localizar mensagem
                  </button>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={onOpenContactInfo}
              aria-label="Informações do contato"
              title="Informações do contato"
              className={actionClass}
            >
              <Info className="size-5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          {assignmentError && <span role="alert" className="absolute top-14 right-2 z-30 max-w-[min(16rem,calc(100vw-1rem))] sm:right-4 rounded-lg border border-red-400/25 bg-zinc-950 px-3 py-2 text-xs text-red-300 shadow-xl">{assignmentError}</span>}
        </>
      )}
    </header>
  );
}
