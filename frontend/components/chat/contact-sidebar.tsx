"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Building2, PanelLeftClose, PanelLeftOpen, Phone, Search, UserRound, UserRoundPlus, X } from "lucide-react";
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { Avatar } from "@/components/chat/avatar";
import { ChatNavigationRail, type ChatRailSection } from "@/components/chat/chat-navigation-rail";
import { CountryCodePicker } from "@/components/chat/country-code-picker";
import { MessageText } from "@/components/chat/message-text";
import { QuickConversationPreview } from "@/components/chat/quick-conversation-preview";
import { CompactScrollArea } from "@/components/ui/compact-scroll-area";
import { useSession } from "@/lib/auth-client";
import { getMessages } from "@/lib/chat-api";
import { getContactPriorityDetails } from "@/lib/contact-priority";
import type { Contact, Message } from "@/types/chat";

type ContactSidebarProps = { userId: string; contacts: Contact[]; loading: boolean; error: string | null; selectedContactId?: number; onSelectContact: (contact: Contact) => void; onLoadSavedContacts: () => Promise<Contact[]>; onSaveContact: (name: string, phone: string, companyName: string) => Promise<Contact[]>; headerActions?: ReactNode; mobileOpen: boolean; revealForSwipe: boolean; onMobileOpenChange: (open: boolean) => void };
type ConversationFilter = "conversations" | "groups" | "mine";
const PREVIEW_HOLD_DURATION = 1_000;
const CHAT_TIME_ZONE = "America/Sao_Paulo";
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: CHAT_TIME_ZONE });
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: CHAT_TIME_ZONE });
const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: CHAT_TIME_ZONE });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: CHAT_TIME_ZONE });
// Mesmo breakpoint "lg" do Tailwind: abaixo dele a lista vira uma tela completa.
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeToDesktopQuery(callback: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function useIsDesktop() {
  return useSyncExternalStore(subscribeToDesktopQuery, () => window.matchMedia(DESKTOP_QUERY).matches, () => true);
}

function formatSidebarDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const key = dayKeyFormatter.format(date);
  if (key === dayKeyFormatter.format(today)) return timeFormatter.format(date);
  if (key === dayKeyFormatter.format(yesterday)) return "Ontem";
  if (today.getTime() - date.getTime() < 6 * 86_400_000) return weekdayFormatter.format(date);
  return dateFormatter.format(date);
}

export function ContactSidebar({ userId, contacts, loading, error, selectedContactId, onSelectContact, onLoadSavedContacts, onSaveContact, headerActions, mobileOpen, revealForSwipe, onMobileOpenChange }: ContactSidebarProps) {
  const reduceMotion = useReducedMotion();
  const { data: session } = useSession();
  const isDesktop = useIsDesktop();
  const [isCollapsed, setIsCollapsed] = useState(false);
  // O modo recolhido só existe no desktop; no mobile o painel abre sempre completo.
  const collapsed = isCollapsed && isDesktop;
  const [query, setQuery] = useState("");
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("conversations");
  const [showArchived, setShowArchived] = useState(false);
  const [showSavedContacts, setShowSavedContacts] = useState(false);
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [savedQuery, setSavedQuery] = useState("");
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactCompany, setNewContactCompany] = useState("");
  const [newContactCountry, setNewContactCountry] = useState<CountryCode>("BR");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [savedActionError, setSavedActionError] = useState<string | null>(null);
  const [holdingContactId, setHoldingContactId] = useState<number | null>(null);
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);
  const [previewMessages, setPreviewMessages] = useState<Message[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const holdingContactIdRef = useRef<number | null>(null);
  const previewRequestRef = useRef(0);
  const previewPanelRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const collapsedButtonRef = useRef<HTMLButtonElement>(null);
  const expandedButtonRef = useRef<HTMLButtonElement>(null);
  const restoreCollapseFocusRef = useRef(false);
  const archivedCount = contacts.filter((contact) => contact.archived).length;
  const visibleContacts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return contacts.filter((contact) => {
      if (!contact.isGroup && !contact.messages?.length && contact.id !== selectedContactId) return false;
      if (contact.archived !== showArchived) return false;
      if (contact.isGroup !== (conversationFilter === "groups")) return false;
      if (conversationFilter === "mine" && !contact.assignedUserIds?.includes(userId)) return false;
      if (!search) return true;
      return contact.name.toLocaleLowerCase("pt-BR").includes(search)
        || contact.phone.includes(search)
        || Boolean(contact.messages?.[0]?.content.toLocaleLowerCase("pt-BR").includes(search));
    });
  }, [contacts, conversationFilter, query, selectedContactId, showArchived, userId]);

  const visibleSavedContacts = useMemo(() => {
    const search = savedQuery.trim().toLocaleLowerCase("pt-BR");
    const phoneSearch = search.replace(/\D/g, "");
    return savedContacts
      .filter((contact) => !search || contact.name.toLocaleLowerCase("pt-BR").includes(search) || (phoneSearch.length > 0 && contact.phone.includes(phoneSearch)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [savedContacts, savedQuery]);

  const loadSavedContacts = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      setSavedContacts(await onLoadSavedContacts());
    } catch (loadError) {
      setSavedError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os contatos salvos");
    } finally {
      setSavedLoading(false);
    }
  }, [onLoadSavedContacts]);

  function openSavedContacts() {
    cancelPreviewHold();
    closePreview();
    setConversationFilter("conversations");
    setShowArchived(false);
    setSavedQuery("");
    setSavedActionError(null);
    setShowNewContact(false);
    setShowSavedContacts(true);
    void loadSavedContacts();
  }

  function navigateFromRail(section: ChatRailSection) {
    if (section === "contacts") {
      openSavedContacts();
      return;
    }
    cancelPreviewHold();
    closePreview();
    setShowNewContact(false);
    setShowSavedContacts(false);
    setSavedActionError(null);
    setShowArchived(section === "archived");
    setConversationFilter(section === "groups" || section === "mine" ? section : "conversations");
  }

  async function handleSaveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingContact) return;
    const callingCode = getCountryCallingCode(newContactCountry);
    const enteredDigits = newContactPhone.replace(/\D/g, "");
    if (newContactPhone.trim().startsWith("+") && !enteredDigits.startsWith(callingCode)) {
      setSavedActionError(`O número precisa usar o código +${callingCode} do país selecionado.`);
      return;
    }
    const phoneDigits = enteredDigits.startsWith(callingCode)
      && (newContactPhone.trim().startsWith("+") || newContactCountry === "BR" && enteredDigits.length >= 12)
      ? enteredDigits.slice(callingCode.length)
      : enteredDigits;
    if (newContactCountry === "BR" && !/^\d{10,11}$/.test(phoneDigits)) {
      setSavedActionError("Informe o DDD e um número de telefone válido.");
      return;
    }
    const internationalPhone = `+${callingCode}${phoneDigits}`;
    if (!parsePhoneNumberFromString(internationalPhone)?.isPossible()) {
      setSavedActionError("Informe um número de telefone válido.");
      return;
    }
    setSavingContact(true);
    setSavedActionError(null);
    try {
      const name = `${newContactFirstName.trim()} ${newContactLastName.trim()}`.trim();
      setSavedContacts(await onSaveContact(name, internationalPhone.slice(1), newContactCompany.trim()));
      setSavedError(null);
      setNewContactFirstName("");
      setNewContactLastName("");
      setNewContactCompany("");
      setNewContactCountry("BR");
      setNewContactPhone("");
      setSavedQuery("");
      setShowNewContact(false);
      setShowSavedContacts(false);
    } catch (actionError) {
      setSavedActionError(actionError instanceof Error ? actionError.message : "Não foi possível salvar o contato");
    } finally {
      setSavingContact(false);
    }
  }

  useEffect(() => {
    if (!showSavedContacts) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented || (event.target as Element)?.closest?.("[data-country-code-popup]")) return;
      if (showNewContact) {
        setSavedActionError(null);
        setShowNewContact(false);
      } else {
        setShowSavedContacts(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showNewContact, showSavedContacts]);

  const closePreview = useCallback(() => {
    previewRequestRef.current += 1;
    setPreviewContact(null);
    setPreviewMessages([]);
    setPreviewLoading(false);
    setPreviewError(null);
  }, []);

  const openPreview = useCallback((contact: Contact) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewContact(contact);
    setPreviewMessages([]);
    setPreviewError(null);
    setPreviewLoading(true);

    void getMessages(contact.id, undefined, 5)
      .then((page) => {
        if (previewRequestRef.current !== requestId) return;
        setPreviewMessages(page.messages);
      })
      .catch((requestError: unknown) => {
        if (previewRequestRef.current !== requestId) return;
        setPreviewError(requestError instanceof Error ? requestError.message : "Não foi possível carregar a prévia");
      })
      .finally(() => {
        if (previewRequestRef.current === requestId) setPreviewLoading(false);
      });
  }, []);

  const cancelPreviewHold = useCallback((contactId?: number) => {
    if (contactId !== undefined && holdingContactIdRef.current !== contactId) return;
    holdingContactIdRef.current = null;
    setHoldingContactId(null);
  }, []);

  function startPreviewHold(contact: Contact, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 2) return;
    cancelPreviewHold();
    holdingContactIdRef.current = contact.id;
    setHoldingContactId(contact.id);
  }

  function completePreviewHold(contact: Contact) {
    if (holdingContactIdRef.current !== contact.id) return;
    // A própria animação controla a espera e mantém o círculo completo até soltar.
    openPreview(contact);
  }

  function selectContactFromClick(contact: Contact, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.detail > 1) return;
    openConversation(contact);
  }

  function openConversation(contact: Contact) {
    cancelPreviewHold();
    closePreview();
    onSelectContact(contact);
  }

  useEffect(() => {
    if (!previewContact) return;

    function handlePointerDown(event: PointerEvent) {
      if (!previewPanelRef.current?.contains(event.target as Node)) closePreview();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePreview();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePreview, previewContact]);

  useEffect(() => {
    function handleMouseUp(event: MouseEvent) {
      if (event.button === 2) cancelPreviewHold();
    }

    function handleBlur() {
      cancelPreviewHold();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancelPreviewHold();
    }

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("keydown", handleKeyDown);
      holdingContactIdRef.current = null;
      previewRequestRef.current += 1;
    };
  }, [cancelPreviewHold]);

  useEffect(() => {
    function handleSidebarShortcut(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing || event.key.toLowerCase() !== "b") return;
      if (document.activeElement?.closest('[role="dialog"]')) return;
      event.preventDefault();
      if (event.repeat) return;

      const headerHasFocus = Boolean(headerRef.current?.contains(document.activeElement));
      const collapseButtonHasFocus = document.activeElement === collapsedButtonRef.current
        || document.activeElement === expandedButtonRef.current;
      if (headerHasFocus) sidebarRef.current?.focus();
      cancelPreviewHold();
      closePreview();
      setShowNewContact(false);
      setShowSavedContacts(false);
      if (isDesktop) {
        restoreCollapseFocusRef.current = !headerHasFocus && collapseButtonHasFocus;
        setIsCollapsed((current) => !current);
      }
      else onMobileOpenChange(!mobileOpen);
    }

    window.addEventListener("keydown", handleSidebarShortcut);
    return () => window.removeEventListener("keydown", handleSidebarShortcut);
  }, [cancelPreviewHold, closePreview, isDesktop, mobileOpen, onMobileOpenChange]);

  useEffect(() => {
    if (isDesktop || !mobileOpen || previewContact || !selectedContactId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (
        event.key !== "Escape"
        || event.defaultPrevented
        || (event.target instanceof Element && event.target.closest("[data-country-code-popup]"))
        || document.activeElement?.closest('[role="dialog"]')
      ) return;
      onMobileOpenChange(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isDesktop, mobileOpen, onMobileOpenChange, previewContact, selectedContactId]);

  useEffect(() => {
    if (!restoreCollapseFocusRef.current) return;
    restoreCollapseFocusRef.current = false;
    (collapsed ? collapsedButtonRef : expandedButtonRef).current?.focus();
  }, [collapsed]);

  // Ao passar para o desktop o painel sobreposto deixa de existir; evita que reapareça ao reduzir a tela.
  useEffect(() => {
    if (isDesktop && mobileOpen) onMobileOpenChange(false);
  }, [isDesktop, mobileOpen, onMobileOpenChange]);

  // No mobile a lista funciona como uma tela: recebe o foco ao abrir e devolve ao fechar.
  useEffect(() => {
    if (isDesktop || !mobileOpen) return;
    const drawer = drawerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawer?.focus({ preventScroll: true });
    return () => {
      if (!drawer?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement && drawer?.contains(document.activeElement)) document.activeElement.blur();
    };
  }, [isDesktop, mobileOpen]);

  function toggleCollapsed() {
    cancelPreviewHold();
    closePreview();
    restoreCollapseFocusRef.current = document.activeElement === collapsedButtonRef.current
      || document.activeElement === expandedButtonRef.current;
    setIsCollapsed((current) => !current);
  }

  const emptyMessage = conversationFilter === "groups"
    ? showArchived ? "Nenhum grupo arquivado" : "Nenhum grupo encontrado"
    : conversationFilter === "mine"
      ? showArchived ? "Nenhuma conversa sua arquivada" : "Nenhuma conversa atribuída a você. Assuma uma conversa na aba Conversas."
      : showArchived ? "Nenhuma conversa arquivada" : "Nenhuma conversa encontrada";
  const activeRailSection: ChatRailSection = showSavedContacts ? "contacts" : showArchived ? "archived" : conversationFilter;
  const navigationRail = (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.div
          key="navigation-rail"
          initial={reduceMotion ? false : { width: 0, opacity: 0 }}
          animate={{ width: 60, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="hidden h-full shrink-0 overflow-hidden lg:block"
        >
          <ChatNavigationRail
            activeSection={activeRailSection}
            unreadCount={contacts.reduce((total, contact) => total + contact.unreadCount, 0)}
            user={session?.user}
            onNavigate={navigateFromRail}
            onOpenSettings={() => { cancelPreviewHold(); closePreview(); }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Desktop: barra fixa ao lado do chat. Mobile/tablet: tela completa de conversas.
  const renderShell = (content: ReactNode) => (
    <>
      <div
        ref={drawerRef}
        id="chat-sidebar"
        tabIndex={-1}
        data-sidebar-open={mobileOpen ? "true" : "false"}
        inert={!mobileOpen && !isDesktop}
        className={`fixed inset-0 z-40 flex h-dvh w-screen bg-zinc-950 outline-none transition-opacity duration-200 motion-reduce:transition-none lg:visible lg:static lg:z-auto lg:h-full lg:w-auto lg:shrink-0 lg:bg-transparent lg:opacity-100 lg:pointer-events-auto lg:transition-none ${mobileOpen ? "visible opacity-100" : revealForSwipe ? "visible pointer-events-none opacity-100" : "invisible pointer-events-none opacity-0"}`}
      >
        {navigationRail}
        {content}
      </div>
    </>
  );
  const panelWidthClass = "w-full min-w-0 max-w-none lg:w-[320px] lg:min-w-[280px] lg:max-w-[42vw]";
  const closeDrawerButton = (
    <button
      type="button"
      aria-label="Fechar menu de conversas"
      title="Fechar menu"
      onClick={() => onMobileOpenChange(false)}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-white lg:hidden"
    >
      <X aria-hidden="true" className="size-5" strokeWidth={1.8} />
    </button>
  );

  if (showSavedContacts && showNewContact) {
    return renderShell(
      <motion.aside
        key="new-contact"
        aria-label="Novo contato"
        initial={reduceMotion ? false : { opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className={`flex h-full min-h-0 ${panelWidthClass} shrink-0 flex-col border-r border-white/[0.08] bg-[#111111] text-white`}
      >
        <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 px-4 pt-[env(safe-area-inset-top)] lg:h-16 lg:pt-0">
          <button type="button" aria-label="Voltar aos contatos" onClick={() => { setSavedActionError(null); setShowNewContact(false); }} className="flex size-10 items-center justify-center rounded-full text-zinc-300 transition-colors lg:size-8 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-white">
            <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-[16px] font-medium">Novo contato</h2>
          {closeDrawerButton}
        </header>
        <form onSubmit={(event) => void handleSaveContact(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-9 pb-8">
            <div className="flex gap-4">
              <UserRound aria-hidden="true" className="mt-3 size-5 shrink-0 text-zinc-500" strokeWidth={1.8} />
              <div className="min-w-0 flex-1 space-y-7">
                <label className="block border-b border-zinc-600 focus-within:border-white">
                  <span className="sr-only">Nome</span>
                  <input autoFocus required autoComplete="given-name" maxLength={100} value={newContactFirstName} onChange={(event) => setNewContactFirstName(event.target.value)} placeholder="Nome" className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" />
                </label>
                <label className="block border-b border-zinc-600 focus-within:border-white">
                  <span className="sr-only">Sobrenome</span>
                  <input autoComplete="family-name" maxLength={90} value={newContactLastName} onChange={(event) => setNewContactLastName(event.target.value)} placeholder="Sobrenome" className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" />
                </label>
              </div>
            </div>
            <div className="mt-10 flex gap-4">
              <Building2 aria-hidden="true" className="mt-3 size-5 shrink-0 text-zinc-500" strokeWidth={1.8} />
              <label className="min-w-0 flex-1 border-b border-zinc-600 focus-within:border-white">
                <span className="sr-only">Empresa</span>
                <input autoComplete="organization" maxLength={191} value={newContactCompany} onChange={(event) => setNewContactCompany(event.target.value)} placeholder="Empresa" className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" />
              </label>
            </div>
            <div className="mt-12 flex gap-4">
              <Phone aria-hidden="true" className="mt-6 size-5 shrink-0 text-zinc-500" strokeWidth={1.8} />
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="relative min-w-0 w-[94px] shrink-0 border-b border-zinc-600 focus-within:border-white">
                  <span className="block text-[11px] text-zinc-500">País</span>
                  <CountryCodePicker value={newContactCountry} onChange={setNewContactCountry} />
                </div>
                <label className="min-w-0 flex-1 border-b border-zinc-600 focus-within:border-white">
                  <span className="block text-[11px] text-zinc-500">Número de telefone</span>
                  <input required type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} value={newContactPhone} onChange={(event) => setNewContactPhone(event.target.value)} placeholder="DDD + número" className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" />
                </label>
              </div>
            </div>
            {savedActionError && <p role="alert" className="mt-6 pl-9 text-sm text-red-300">{savedActionError}</p>}
          </div>
          <div className="shrink-0 border-t border-white/[0.08] px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4">
            <button type="submit" disabled={savingContact || !newContactFirstName.trim() || !newContactPhone.trim()} className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:bg-zinc-700 disabled:text-zinc-400">
              {savingContact ? "Salvando..." : "Salvar contato"}
            </button>
          </div>
        </form>
      </motion.aside>,
    );
  }

  if (showSavedContacts) {
    let previousLetter = "";
    return renderShell(
      <motion.aside
        key="saved-contacts"
        aria-label="Nova conversa"
        initial={reduceMotion ? false : { opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className={`flex h-full min-h-0 ${panelWidthClass} shrink-0 flex-col border-r border-white/[0.08] bg-[#111111] text-zinc-100`}
      >
        <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 px-4 pt-[env(safe-area-inset-top)] lg:h-16 lg:pt-0">
          <button type="button" aria-label="Voltar às conversas" onClick={() => setShowSavedContacts(false)} className="flex size-10 items-center justify-center rounded-full text-zinc-400 transition-colors lg:size-8 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-white">
            <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">Nova conversa</h2>
          {closeDrawerButton}
        </header>
        <label className="mx-4 mb-3 flex h-10 shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-zinc-500 transition-colors focus-within:border-white/40 focus-within:text-zinc-300">
          <Search aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
          <input autoFocus type="search" aria-label="Pesquisar contatos salvos" value={savedQuery} onChange={(event) => setSavedQuery(event.target.value)} placeholder="Pesquisar nome ou número" className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500" />
        </label>
        <CompactScrollArea className="flex-1" label="Contatos salvos">
          <div className="px-2 pt-1">
            <motion.button type="button" onClick={() => { setSavedActionError(null); setShowNewContact(true); }} whileTap={reduceMotion ? undefined : { scale: 0.98 }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-white">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-800 text-zinc-100">
                <UserRoundPlus aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </span>
              <span className="text-sm font-medium text-zinc-100">Novo contato</span>
            </motion.button>
            {savedActionError && <p role="alert" className="px-3 pt-3 text-sm text-red-300">{savedActionError}</p>}
          </div>
          {savedLoading && <p role="status" className="px-5 py-8 text-sm text-zinc-400">Carregando contatos salvos...</p>}
          {!savedLoading && savedError && (
            <div className="px-5 py-8 text-sm text-red-300" role="alert">
              <p>{savedError}</p>
              <button type="button" onClick={() => void loadSavedContacts()} className="mt-3 rounded-lg border border-white/20 px-3 py-1.5 text-zinc-100 hover:bg-white/10">Tentar novamente</button>
            </div>
          )}
          {!savedLoading && !savedError && (
            <div className="px-5 pt-7 pb-2 text-[11px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">Contatos salvos</div>
          )}
          {!savedLoading && !savedError && visibleSavedContacts.length === 0 && <p className="px-5 py-6 text-sm leading-5 text-zinc-500">{savedQuery ? "Nenhum contato encontrado" : "Sua lista está vazia. Salve um contato para iniciar uma conversa."}</p>}
          {!savedLoading && !savedError && visibleSavedContacts.map((contact) => {
            const first = contact.name.trim().charAt(0).toLocaleUpperCase("pt-BR");
            const letter = /^[A-ZÀ-ÖØ-Ý]$/u.test(first) ? first : "#";
            const showLetter = letter !== previousLetter;
            previousLetter = letter;
            return (
              <div key={contact.id}>
                {showLetter && <div className="px-5 pt-5 pb-1.5 text-xs font-medium text-zinc-500">{letter}</div>}
                <div className="mx-2 flex items-center rounded-xl transition-colors hover:bg-white/[0.05]">
                  <button type="button" onClick={() => { onSelectContact(contact); setShowSavedContacts(false); }} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:bg-white/[0.07] focus-visible:outline-none">
                    <Avatar contact={contact} className="size-10" />
                    <span className="min-w-0 flex-1 py-1">
                      <span className="block truncate text-sm font-medium">{contact.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-500">{contact.phone}</span>
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </CompactScrollArea>
      </motion.aside>,
    );
  }

  return renderShell(
      <aside
        ref={sidebarRef}
        tabIndex={-1}
        aria-label="Barra lateral de conversas"
        aria-keyshortcuts="Control+b"
        className={`relative flex h-full min-h-0 shrink-0 flex-col bg-[#09090b] outline-none transition-[width,min-width,max-width] duration-200 motion-reduce:transition-none lg:border-r lg:border-white/[0.08] lg:bg-transparent ${collapsed ? "w-20 min-w-20 max-w-20" : panelWidthClass}`}
      >
        {collapsed && (
          <div className="flex justify-center pt-4">
            <button
              ref={collapsedButtonRef}
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expandir menu de conversas"
              aria-expanded={false}
              title="Expandir menu (Ctrl+B)"
              className="flex size-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-white/50"
            >
              <PanelLeftOpen aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </button>
          </div>
        )}
        <header ref={headerRef} hidden={collapsed} className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-5 lg:px-4 lg:pt-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-[28px] font-semibold tracking-[-0.03em] text-zinc-100 lg:text-lg lg:tracking-tight">
              <span className="lg:hidden">Conversas</span>
              <span className="hidden lg:inline">CotrimBot</span>
            </h1>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden lg:contents">{headerActions}</span>
              <motion.button
                type="button"
                aria-label="Nova conversa"
                onClick={openSavedContacts}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                className="flex size-10 items-center justify-center rounded-full bg-zinc-200 text-zinc-950 transition-colors hover:bg-white lg:size-8 lg:bg-zinc-950 lg:text-zinc-400 lg:hover:bg-zinc-800 lg:hover:text-zinc-200"
              >
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </motion.button>
              <button
                ref={expandedButtonRef}
                type="button"
                onClick={toggleCollapsed}
                aria-label="Recolher menu de conversas"
                aria-expanded={true}
                title="Recolher menu (Ctrl+B)"
                className="hidden size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-white/50 lg:flex"
              >
                <PanelLeftClose aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
              </button>
            </div>
          </div>

          <label className="mt-3 flex h-10 items-center gap-2 rounded-full lg:h-9 border border-white/10 bg-gradient-to-b from-white/[0.075] via-white/[0.035] to-white/[0.015] px-3 text-zinc-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.16),inset_0_-1px_1px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur-2xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow,color] focus-within:border-white/20 focus-within:bg-zinc-900/65 focus-within:text-zinc-300 focus-within:ring-2 focus-within:ring-white/[0.05]">
            <svg className="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar conversas"
              className="min-w-0 flex-1 bg-transparent text-[13px] font-normal text-zinc-100 outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
            />
          </label>

          <div className="mt-3 grid grid-cols-3 items-center gap-2 pb-1 lg:mt-1.5 lg:gap-1 lg:pb-0" role="group" aria-label="Filtrar conversas">
            <motion.button
              type="button"
              onClick={() => setConversationFilter("conversations")}
              aria-pressed={conversationFilter === "conversations"}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className={`relative flex h-8 w-full items-center justify-center rounded-full border px-2 text-[13px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/40 lg:rounded-none lg:border-0 ${conversationFilter === "conversations" ? "border-white/20 bg-zinc-700 text-zinc-100 lg:bg-transparent" : "border-white/10 bg-white/[0.035] text-zinc-400 hover:text-zinc-200 lg:bg-transparent lg:text-zinc-500 lg:hover:text-zinc-300"}`}
            >
              Conversas
              {conversationFilter === "conversations" && <motion.span layoutId="conversation-filter-underline" aria-hidden="true" className="absolute inset-x-3 bottom-0 hidden h-px rounded-full bg-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.22)] lg:block" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 36, mass: 0.65 }} />}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setConversationFilter("groups")}
              aria-pressed={conversationFilter === "groups"}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className={`relative flex h-8 w-full items-center justify-center rounded-full border px-2 text-[13px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/40 lg:rounded-none lg:border-0 ${conversationFilter === "groups" ? "border-white/20 bg-zinc-700 text-zinc-100 lg:bg-transparent" : "border-white/10 bg-white/[0.035] text-zinc-400 hover:text-zinc-200 lg:bg-transparent lg:text-zinc-500 lg:hover:text-zinc-300"}`}
            >
              Grupos
              {conversationFilter === "groups" && <motion.span layoutId="conversation-filter-underline" aria-hidden="true" className="absolute inset-x-3 bottom-0 hidden h-px rounded-full bg-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.22)] lg:block" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 36, mass: 0.65 }} />}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setConversationFilter("mine")}
              aria-pressed={conversationFilter === "mine"}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className={`relative flex h-8 w-full items-center justify-center rounded-full border px-2 text-[13px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/40 lg:rounded-none lg:border-0 ${conversationFilter === "mine" ? "border-white/20 bg-zinc-700 text-zinc-100 lg:bg-transparent" : "border-white/10 bg-white/[0.035] text-zinc-400 hover:text-zinc-200 lg:bg-transparent lg:text-zinc-500 lg:hover:text-zinc-300"}`}
            >
              Minhas
              {conversationFilter === "mine" && <motion.span layoutId="conversation-filter-underline" aria-hidden="true" className="absolute inset-x-3 bottom-0 hidden h-px rounded-full bg-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.22)] lg:block" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 36, mass: 0.65 }} />}
            </motion.button>
          </div>

          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            aria-pressed={showArchived}
            className={`mt-1.5 flex h-10 w-full items-center lg:h-8 gap-2.5 rounded-[10px] px-2 text-left text-[13px] transition-colors hover:bg-white/[0.04] hover:text-zinc-200 ${showArchived ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400"}`}
          >
            <svg className="size-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16v13H4zM3 4h18v3H3z" /><path d="M10 12h4" />
            </svg>
            <span className="flex-1">Arquivadas</span>
            {archivedCount > 0 && <span className="text-[11px] tabular-nums text-zinc-500">{archivedCount}</span>}
            <svg className={`size-3.5 text-zinc-600 transition-transform ${showArchived ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </header>

        <CompactScrollArea className="flex-1" label="Lista de conversas">
          <div className={collapsed ? "space-y-1 py-3 pr-1 pl-3" : "px-2 pb-2"}>
            <AnimatePresence initial={false} mode="popLayout">
            {visibleContacts.map((contact, index) => {
              const lastMessage = contact.messages?.[0];
              const selected = selectedContactId === contact.id;
              const unread = contact.unreadCount > 0;
              const priority = getContactPriorityDetails(contact.priority);
              return (
                <motion.div
                  layout="position"
                  key={contact.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.985 }}
                  whileHover={reduceMotion ? undefined : { x: 2 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.2, delay: Math.min(index, 6) * 0.018, ease: [0.22, 1, 0.36, 1], layout: { type: "spring", stiffness: 460, damping: 38 } }}
                  className={`group relative rounded-none border-b border-white/[0.08] transition-colors lg:rounded-xl lg:border-b-0 ${selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => startPreviewHold(contact, event)}
                    onMouseLeave={() => cancelPreviewHold(contact.id)}
                    onPointerCancel={() => cancelPreviewHold(contact.id)}
                    onContextMenu={(event) => {
                      if (event.button !== 2) return;
                      event.preventDefault();
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => selectContactFromClick(contact, event)}
                    aria-label={`${contact.name}${priority ? `, prioridade ${priority.label.toLowerCase()}` : ""}${unread ? `, ${contact.unreadCount} mensagens não lidas` : ""}`}
                    aria-current={selected ? "true" : undefined}
                    title={`${contact.name}${priority ? ` — Prioridade ${priority.label.toLowerCase()}` : ""} — Clique para abrir a conversa; segure o botão direito por 1 segundo para ver a prévia`}
                    className={`block w-full select-none text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 ${collapsed ? "rounded-xl py-2" : "px-2"}`}
                  >
                  <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
                    <span className="relative shrink-0">
                      <Avatar contact={contact} />
                      {collapsed && unread && (
                        <motion.span
                          aria-hidden="true"
                          initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#09090b] bg-zinc-300 px-1 text-[9px] font-bold leading-none text-zinc-950"
                        >
                          {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
                        </motion.span>
                      )}
                      <AnimatePresence initial={false}>
                        {collapsed && priority && (
                          <motion.span
                            aria-hidden="true"
                            initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.4 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#09090b] transition-colors duration-200 ${priority.dot}`}
                          />
                        )}
                      </AnimatePresence>
                      {holdingContactId === contact.id && (
                        <svg className="pointer-events-none absolute -inset-1 size-12 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
                          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20" />
                          <circle
                            cx="24"
                            cy="24"
                            r="22"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            pathLength="100"
                            strokeDasharray="100"
                            strokeDashoffset="100"
                            className="text-white"
                            style={{ animation: `conversation-preview-hold ${PREVIEW_HOLD_DURATION}ms linear forwards` }}
                            onAnimationEnd={() => completePreviewHold(contact)}
                          />
                        </svg>
                      )}
                    </span>
                    <div className={collapsed ? "hidden" : "min-w-0 flex-1 py-3 lg:py-2"}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-[14px] leading-tight font-medium tracking-[-0.01em] text-zinc-50">{contact.name}</p>
                        {lastMessage && (
                          <time dateTime={lastMessage.createdAt} className={`shrink-0 text-[11px] leading-tight ${unread ? "font-medium text-zinc-300" : "font-normal text-zinc-500"}`}>
                            {formatSidebarDate(lastMessage.createdAt)}
                          </time>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[12px] leading-tight font-normal text-zinc-500">
                          {lastMessage && !lastMessage.deletedAt && lastMessage.direction === "OUTGOING" && "✓✓ "}
                          <MessageText content={lastMessage ? lastMessage.deletedAt ? "Mensagem apagada" : lastMessage.content : "Nenhuma mensagem"} showSignature={Boolean(lastMessage && !lastMessage.deletedAt && !lastMessage.private && lastMessage.direction === "OUTGOING")} linkify={false} />
                        </p>
                        {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-300 px-1.5 text-[10px] font-semibold text-zinc-950">
                            {contact.unreadCount}
                          </span>
                        )}
                        <AnimatePresence initial={false}>
                          {priority && (
                            <motion.span
                              aria-hidden="true"
                              initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.4 }}
                              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                              className={`size-2 shrink-0 rounded-full transition-colors duration-200 ${priority.dot}`}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                  </button>
                </motion.div>
              );
            })}
            </AnimatePresence>
            {loading && (
              <p role="status" title="Carregando conversas..." className={`py-10 text-center text-[13px] text-zinc-500 ${collapsed ? "flex justify-center" : "px-4"}`}>
                {collapsed && <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300 motion-reduce:animate-none" />}
                <span className={collapsed ? "sr-only" : undefined}>Carregando conversas...</span>
              </p>
            )}
            {!loading && error && (
              <p role="alert" title={error} className={`py-10 text-center text-[13px] text-red-300 ${collapsed ? "flex justify-center" : "px-4"}`}>
                {collapsed && <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full border border-current">!</span>}
                <span className={collapsed ? "sr-only" : undefined}>{error}</span>
              </p>
            )}
            {!loading && !error && visibleContacts.length === 0 && (
              <p title={emptyMessage} className={`py-10 text-center text-[13px] text-zinc-500 ${collapsed ? "flex justify-center" : "px-4"}`}>
                {collapsed && (
                  <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
                  </svg>
                )}
                <span className={collapsed ? "sr-only" : undefined}>{emptyMessage}</span>
              </p>
            )}
          </div>
        </CompactScrollArea>
        <QuickConversationPreview
          contact={previewContact}
          messages={previewMessages}
          loading={previewLoading}
          error={previewError}
          panelRef={previewPanelRef}
          onOpenConversation={openConversation}
        />
      </aside>,
  );
}
