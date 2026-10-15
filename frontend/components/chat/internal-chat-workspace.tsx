"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, CheckCheck, ChevronDown, Copy, EllipsisVertical, Info, LockKeyhole, MessageCircle, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Reply, Search, Trash2, UserRoundPlus, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChatNavigationRail, type ChatRailSection } from "@/components/chat/chat-navigation-rail";
import { CompactScrollArea } from "@/components/ui/compact-scroll-area";
import { EmptyChatAnimation } from "@/components/chat/empty-chat-animation";
import { MessageText } from "@/components/chat/message-text";
import { MessageComposer } from "@/components/chat/message-composer";
import { InternalMediaContent } from "@/components/chat/internal-media-content";
import { InternalConversationPreview } from "@/components/chat/internal-conversation-preview";
import { useInternalChat } from "@/hooks/use-internal-chat";
import { useNotifications } from "@/hooks/use-notifications";
import { authClient, useSession } from "@/lib/auth-client";
import { internalChatApi, internalMediaUrl, type InternalConversation, type InternalMember, type InternalMessage } from "@/lib/internal-chat-api";
import type { Message } from "@/types/chat";

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dayFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" });
const fullDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const PREVIEW_HOLD_DURATION = 1_000;
const MOBILE_PREVIEW_HOLD_DURATION = 500;
const PREVIEW_MOVE_TOLERANCE = 12;

function conversationName(conversation: InternalConversation, userId?: string, members: InternalMember[] = []) {
  if (conversation.type === "GROUP") return conversation.name || "Grupo sem nome";
  const other = conversation.participants.find((participant) => participant.user.id !== userId)?.user
    ?? conversation.participants[0]?.user;
  return (other && members.find((member) => member.userId === other.id)?.displayName) || other?.name || "Conversa";
}

function conversationImage(conversation: InternalConversation, userId?: string) {
  return conversation.type === "GROUP" ? conversation.avatarUrl : conversation.participants.find((participant) => participant.user.id !== userId)?.user.image;
}

function Avatar({ name, image, group = false, className = "size-10" }: { name: string; image?: string | null; group?: boolean; className?: string; }) {
  return image
    ? <img src={image} alt={name} className={`${className} shrink-0 rounded-full object-cover`} /> // eslint-disable-line @next/next/no-img-element
    : <span className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-zinc-700 font-semibold text-zinc-100`}>{group ? <UsersRound className="size-5" /> : name.charAt(0).toUpperCase()}</span>;
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (dayFormatter.format(date) === dayFormatter.format(today)) return "Hoje";
  if (dayFormatter.format(date) === dayFormatter.format(yesterday)) return "Ontem";
  return fullDateFormatter.format(date);
}

function sidebarDate(value: string) {
  const label = dateLabel(value);
  return label === "Hoje" ? timeFormatter.format(new Date(value)) : label;
}

function composerReply(message: InternalMessage | null, userId?: string): Pick<Message, "id" | "type" | "content" | "direction" | "senderName" | "private"> | null {
  if (!message) return null;
  const mime = message.media?.mimeType ?? "";
  const type: Message["type"] = message.type === "TEXT" ? "TEXT" : mime.startsWith("image/") ? "IMAGE" : mime.startsWith("video/") ? "VIDEO" : mime.startsWith("audio/") ? "AUDIO" : "DOCUMENT";
  return { id: message.id, type, content: message.content, direction: message.senderId === userId ? "OUTGOING" : "INCOMING", senderName: message.sender.name, private: message.private };
}

const menuItemClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-zinc-200 transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none";

function MemberContactRow({ member, collapsed, onOpen }: { member: InternalMember; collapsed: boolean; onOpen: () => void }) {
  const name = member.displayName || member.user.name;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Iniciar conversa com ${name}`}
      className={`group flex w-full items-center rounded-none border-b border-white/[0.08] text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-zinc-400 lg:rounded-xl lg:border-b-0 ${collapsed ? "justify-center py-2" : "gap-2.5 px-2"}`}
    >
      <Avatar name={name} image={member.user.image} className="size-12 lg:size-10" />
      {!collapsed && <span className="min-w-0 flex-1 py-3 lg:py-2">
        <strong className="block truncate text-base font-medium leading-tight text-zinc-50 lg:text-[14px]">{name}</strong>
        <span className="mt-0.5 block truncate text-sm leading-tight text-zinc-400 lg:text-[12px] lg:text-zinc-500">{member.user.email || "Iniciar conversa"}</span>
      </span>}
    </button>
  );
}

export function InternalChatWorkspace() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { data: session } = useSession();
  const chat = useInternalChat();
  const notifications = useNotifications({
    onOpenContact: (contactId) => router.push(`/?contactId=${contactId}`),
    onOpenInternalConversation: (conversationId) => selectConversation(conversationId),
  });
  const userId = session?.user.id;
  const [company, setCompany] = useState<{ name: string; logo: string | null; } | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [conversationPanel, setConversationPanel] = useState<HTMLElement | null>(null);
  const [replyTo, setReplyTo] = useState<InternalMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [holdingConversationId, setHoldingConversationId] = useState<string | null>(null);
  const [previewHoldDuration, setPreviewHoldDuration] = useState(PREVIEW_HOLD_DURATION);
  const [previewConversation, setPreviewConversation] = useState<InternalConversation | null>(null);
  const [previewMessages, setPreviewMessages] = useState<InternalMessage[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const holdingConversationIdRef = useRef<string | null>(null);
  const touchHoldRef = useRef<{ conversationId: string; pointerId: number; startX: number; startY: number } | null>(null);
  const touchHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressConversationClickRef = useRef<string | null>(null);
  const previewRequestRef = useRef(0);
  const previewPanelRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const collapsedButtonRef = useRef<HTMLButtonElement>(null);
  const expandedButtonRef = useRef<HTMLButtonElement>(null);
  const restoreCollapseFocusRef = useRef(false);
  const nearBottomRef = useRef(true);
  const previousConversationId = useRef<string | null>(null);
  const previousMessageId = useRef<number | null>(null);
  const prependHeightRef = useRef<number | null>(null);

  const closePreview = useCallback(() => {
    previewRequestRef.current += 1;
    suppressConversationClickRef.current = null;
    setPreviewConversation(null);
    setPreviewMessages([]);
    setPreviewLoading(false);
    setPreviewError(null);
  }, []);

  const cancelPreviewHold = useCallback((conversationId?: string) => {
    if (conversationId && holdingConversationIdRef.current !== conversationId) return;
    if (touchHoldTimerRef.current !== null) clearTimeout(touchHoldTimerRef.current);
    touchHoldTimerRef.current = null;
    touchHoldRef.current = null;
    holdingConversationIdRef.current = null;
    setHoldingConversationId(null);
  }, []);

  const openPreview = useCallback((conversation: InternalConversation) => {
    if (!chat.organizationId) return;
    const requestId = ++previewRequestRef.current;
    setPreviewConversation(conversation);
    setPreviewMessages([]);
    setPreviewError(null);
    setPreviewLoading(true);
    void internalChatApi.messages(chat.organizationId, conversation.id, undefined, 5)
      .then((page) => {
        if (previewRequestRef.current === requestId) setPreviewMessages(page.messages);
      })
      .catch((error: unknown) => {
        if (previewRequestRef.current === requestId) setPreviewError(error instanceof Error ? error.message : "Não foi possível carregar a prévia");
      })
      .finally(() => {
        if (previewRequestRef.current === requestId) setPreviewLoading(false);
      });
  }, [chat.organizationId]);

  function startPreviewHold(conversation: InternalConversation, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 2) return;
    cancelPreviewHold();
    setPreviewHoldDuration(PREVIEW_HOLD_DURATION);
    holdingConversationIdRef.current = conversation.id;
    setHoldingConversationId(conversation.id);
  }

  function startTouchPreviewHold(conversation: InternalConversation, event: ReactPointerEvent<HTMLButtonElement>) {
    suppressConversationClickRef.current = null;
    if (window.matchMedia("(min-width: 1024px)").matches || !event.isPrimary || event.button !== 0 || !["touch", "pen"].includes(event.pointerType)) return;
    cancelPreviewHold();
    const pointerId = event.pointerId;
    touchHoldRef.current = { conversationId: conversation.id, pointerId, startX: event.clientX, startY: event.clientY };
    holdingConversationIdRef.current = conversation.id;
    setPreviewHoldDuration(MOBILE_PREVIEW_HOLD_DURATION);
    setHoldingConversationId(conversation.id);
    touchHoldTimerRef.current = setTimeout(() => {
      if (touchHoldRef.current?.pointerId === pointerId) activateTouchPreviewHold(conversation);
    }, MOBILE_PREVIEW_HOLD_DURATION);
  }

  function activateTouchPreviewHold(conversation: InternalConversation) {
    if (touchHoldRef.current?.conversationId !== conversation.id) return;
    suppressConversationClickRef.current = conversation.id;
    cancelPreviewHold(conversation.id);
    openPreview(conversation);
  }

  function moveTouchPreviewHold(conversationId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    const hold = touchHoldRef.current;
    if (!hold || hold.conversationId !== conversationId || hold.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - hold.startX, event.clientY - hold.startY) > PREVIEW_MOVE_TOLERANCE) cancelPreviewHold(conversationId);
  }

  function completePreviewHold(conversation: InternalConversation) {
    if (holdingConversationIdRef.current !== conversation.id || touchHoldRef.current) return;
    openPreview(conversation);
  }

  function selectConversationFromClick(conversation: InternalConversation, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressConversationClickRef.current === conversation.id) {
      suppressConversationClickRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.detail > 1) return;
    selectConversation(conversation.id);
  }

  useEffect(() => {
    if (!previewConversation) return;
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
  }, [closePreview, previewConversation]);

  useEffect(() => {
    function handleMouseUp(event: MouseEvent) {
      if (event.button === 2) cancelPreviewHold();
    }
    function handleBlur() { cancelPreviewHold(); }
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
      if (touchHoldTimerRef.current !== null) clearTimeout(touchHoldTimerRef.current);
      previewRequestRef.current += 1;
    };
  }, [cancelPreviewHold]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const expandOnMobile = () => { if (!query.matches) setCollapsed(false); };
    query.addEventListener("change", expandOnMobile);
    return () => query.removeEventListener("change", expandOnMobile);
  }, []);

  useEffect(() => {
    if (!chat.selectedId || !new URLSearchParams(window.location.search).has("conversationId")) return;
    const frame = requestAnimationFrame(() => setMobileListOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [chat.selectedId]);

  useEffect(() => {
    let active = true;
    void authClient.organization.list().then(({ data }) => {
      if (!active) return;
      const organizations = (data ?? []) as Array<{ id: string; name: string; logo?: string | null; }>;
      const item = organizations.find((organization) => organization.id === chat.organizationId) ?? organizations[0];
      setCompany(item ? { name: item.name, logo: item.logo ?? null } : null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [chat.organizationId]);

  useEffect(() => {
    function closeMenus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHeaderMenuOpen(false);
        setRowMenuId(null);
        setMessageMenuId(null);
        setSearchOpen(false);
        setInfoOpen(false);
        setGroupOpen(false);
        setAddMembersOpen(false);
      }
    }
    window.addEventListener("keydown", closeMenus);
    return () => window.removeEventListener("keydown", closeMenus);
  }, []);

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
      if (window.matchMedia("(min-width: 1024px)").matches) {
        restoreCollapseFocusRef.current = !headerHasFocus && collapseButtonHasFocus;
        setCollapsed((current) => !current);
      } else {
        setMobileListOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleSidebarShortcut);
    return () => window.removeEventListener("keydown", handleSidebarShortcut);
  }, [cancelPreviewHold, closePreview]);

  useEffect(() => {
    if (!restoreCollapseFocusRef.current) return;
    restoreCollapseFocusRef.current = false;
    (collapsed ? collapsedButtonRef : expandedButtonRef).current?.focus();
  }, [collapsed]);

  const conversations = useMemo(() => chat.conversations.filter((conversation) => {
    if (Boolean(conversation.archived) !== showArchived) return false;
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return !search || conversationName(conversation, userId, chat.members).toLocaleLowerCase("pt-BR").includes(search)
      || conversation.participants.some((participant) => participant.user.email?.toLocaleLowerCase("pt-BR").includes(search))
      || conversation.lastMessage?.content.toLocaleLowerCase("pt-BR").includes(search);
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [chat.conversations, chat.members, query, showArchived, userId]);

  const memberResults = chat.members.filter((member) => member.userId !== userId && (!query || (member.displayName || member.user.name).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) || member.user.email?.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))));
  const memberContacts = !showArchived ? memberResults.filter((member) => !chat.conversations.some((conversation) => conversation.type === "DIRECT" && !conversation.archived && conversation.participants.some((participant) => participant.user.id === member.userId))) : [];
  const selectedName = chat.selected ? conversationName(chat.selected, userId, chat.members) : "";
  const selectedImage = chat.selected ? conversationImage(chat.selected, userId) : null;
  const selectedContact = chat.selected?.participants.find((participant) => participant.user.id !== userId)?.user;
  const firstMessageId = chat.messages[0]?.id;
  const searchResults = useMemo(() => chat.messages.filter((message) => searchText.trim() && message.content.toLocaleLowerCase("pt-BR").includes(searchText.trim().toLocaleLowerCase("pt-BR"))), [chat.messages, searchText]);

  useEffect(() => {
    const target = searchResults[searchIndex];
    if (searchOpen && target) document.getElementById(`internal-message-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchIndex, searchOpen, searchResults]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const lastId = chat.messages.at(-1)?.id ?? null;
    if (previousConversationId.current !== chat.selectedId) {
      previousConversationId.current = chat.selectedId;
      previousMessageId.current = lastId;
      element.scrollTop = element.scrollHeight;
      nearBottomRef.current = true;
    } else if (lastId !== previousMessageId.current && nearBottomRef.current) {
      previousMessageId.current = lastId;
      requestAnimationFrame(() => { element.scrollTop = element.scrollHeight; });
    }
  }, [chat.messages, chat.selectedId]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const height = prependHeightRef.current;
    if (!element || height === null) return;
    element.scrollTop += element.scrollHeight - height;
    prependHeightRef.current = null;
  }, [firstMessageId]);

  function navigate(section: ChatRailSection) {
    cancelPreviewHold();
    closePreview();
    setMembersOpen(false);
    setShowArchived(section === "archived");
    if (section === "notifications") router.push("/");
  }

  function toggleCollapsed() {
    cancelPreviewHold();
    closePreview();
    restoreCollapseFocusRef.current = document.activeElement === collapsedButtonRef.current
      || document.activeElement === expandedButtonRef.current;
    setCollapsed((current) => !current);
  }

  function selectConversation(id: string) {
    cancelPreviewHold();
    closePreview();
    chat.selectConversation(id);
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    setMembersOpen(false);
    setMobileListOpen(false);
    setReplyTo(null);
    setText("");
    setInfoOpen(false);
    setRowMenuId(null);
    setActionError(null);
  }

  async function startDirect(memberId: string) {
    try {
      await chat.startDirect(memberId);
      const archivedConversation = chat.conversations.find((conversation) => conversation.type === "DIRECT" && conversation.archived && conversation.participants.some((participant) => participant.user.id === memberId));
      if (archivedConversation) await chat.updatePreferences(archivedConversation.id, { archived: false });
      setText("");
      setReplyTo(null);
      setMembersOpen(false);
      setMobileListOpen(false);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível iniciar a conversa.");
    }
  }

  async function createGroup() {
    if (!groupName.trim() || !groupMemberIds.length) return;
    try {
      await chat.startGroup(groupName.trim(), groupMemberIds);
      setText("");
      setReplyTo(null);
      setGroupOpen(false);
      setMembersOpen(false);
      setMobileListOpen(false);
      setGroupName("");
      setGroupMemberIds([]);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível criar o grupo.");
    }
  }

  async function addMembers() {
    if (!addMemberIds.length) return;
    try {
      await chat.addParticipants(addMemberIds);
      setAddMembersOpen(false);
      setAddMemberIds([]);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível adicionar os participantes.");
    }
  }

  function openAddMembers() {
    if (!chat.selected) return;
    if (chat.selected.type === "DIRECT") {
      const otherId = chat.selected.participants.find((participant) => participant.user.id !== userId)?.user.id;
      setGroupMemberIds(otherId ? [otherId] : []);
      setGroupOpen(true);
      return;
    }
    setAddMemberIds([]);
    setAddMembersOpen(true);
  }

  async function submitMessage(options: { private: boolean; includeSignature: boolean; mentionedUserIds?: string[] }) {
    if (!text.trim() || chat.sending) return;
    try {
      await chat.sendMessage(text, replyTo?.id, options);
      setText("");
      setReplyTo(null);
      chat.sendTyping(false);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    }
  }

  async function updatePreference(conversation: InternalConversation, key: "pinned" | "archived") {
    try {
      await chat.updatePreferences(conversation.id, { [key]: !conversation[key] });
      setRowMenuId(null);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível atualizar a conversa.");
    }
  }

  async function deleteMessage(message: InternalMessage) {
    try {
      await chat.deleteMessage(message.id);
      setMessageMenuId(null);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível apagar a mensagem.");
    }
  }

  async function loadOlderMessages() {
    const element = scrollRef.current;
    if (!element || !chat.hasOlderMessages || chat.loadingOlderMessages || prependHeightRef.current !== null) return;
    prependHeightRef.current = element.scrollHeight;
    try {
      if (!await chat.loadOlderMessages()) prependHeightRef.current = null;
    } catch (error) {
      prependHeightRef.current = null;
      setActionError(error instanceof Error ? error.message : "Não foi possível carregar mensagens anteriores.");
    }
  }

  const sidebarVisible = mobileListOpen || !chat.selected;

  return (
    <main className="flex h-dvh overflow-hidden bg-zinc-950 text-white">
      <div id="chat-sidebar" className={`fixed inset-0 z-40 flex bg-zinc-950 lg:static lg:h-full lg:w-auto lg:shrink-0 ${sidebarVisible ? "visible" : "invisible lg:visible"}`}>
        <AnimatePresence initial={false}>
          {!collapsed && <motion.div key="navigation-rail" initial={reduceMotion ? false : { width: 0, opacity: 0 }} animate={{ width: 60, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="hidden h-full shrink-0 overflow-hidden lg:block"><ChatNavigationRail activeSection={showArchived ? "archived" : "conversations"} unreadCount={chat.conversations.reduce((sum, conversation) => sum + (conversation.unreadCount ?? 0), 0)} notificationUnreadCount={notifications.unreadCount} company={company} user={session?.user} onNavigate={navigate} onOpenSettings={() => undefined} unifiedConversations /></motion.div>}
        </AnimatePresence>
        <aside ref={sidebarRef} tabIndex={-1} aria-label="Barra lateral de conversas" aria-keyshortcuts="Control+b" className={`relative flex h-full min-h-0 shrink-0 flex-col bg-[#09090b] outline-none transition-[width,min-width,max-width] duration-200 motion-reduce:transition-none lg:border-r lg:border-white/[0.08] lg:bg-transparent ${collapsed ? "w-20 min-w-20 max-w-20" : "w-full min-w-0 max-w-none lg:w-[320px] lg:min-w-[280px] lg:max-w-[42vw]"}`}>
          {collapsed && <div className="flex justify-center pt-4"><button ref={collapsedButtonRef} type="button" onClick={toggleCollapsed} aria-label="Expandir menu de conversas" aria-expanded={false} title="Expandir menu (Ctrl+B)" className="flex size-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-white/50"><PanelLeftOpen aria-hidden="true" className="size-5" strokeWidth={1.8} /></button></div>}
          <header ref={headerRef} hidden={collapsed} className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-5 lg:px-4 lg:pt-4">
            <div className="flex items-center justify-between gap-2"><h1 className="min-w-0 truncate text-[28px] font-semibold tracking-[-0.03em] text-zinc-100 lg:text-lg lg:tracking-tight"><span className="lg:hidden">Conversas</span><span className="hidden lg:inline">CotrimBot</span></h1><button ref={expandedButtonRef} type="button" onClick={toggleCollapsed} aria-label="Recolher menu de conversas" aria-expanded={true} title="Recolher menu (Ctrl+B)" className="hidden size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-white/50 lg:flex"><PanelLeftClose aria-hidden="true" className="size-[18px]" strokeWidth={1.8} /></button></div>
            <label className="mt-3 flex h-11 items-center gap-2 rounded-full border border-white/10 bg-gradient-to-b from-white/[0.075] via-white/[0.035] to-white/[0.015] px-3 text-zinc-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.16),inset_0_-1px_1px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.14)] focus-within:border-white/20 lg:h-9"><Search className="size-[15px] shrink-0" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar chats e membros" className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-400 lg:text-[13px]" /></label>
            {membersOpen ? <div className="mt-3 flex items-center justify-between"><button type="button" onClick={() => setMembersOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300"><ArrowLeft className="size-4" /> Voltar às conversas</button><button type="button" onClick={() => setGroupOpen(true)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/15">Novo grupo</button></div> : (showArchived || chat.conversations.some((conversation) => conversation.archived)) && <button type="button" onClick={() => setShowArchived((current) => !current)} className={`mt-1.5 flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-sm hover:bg-white/[0.04] lg:h-8 lg:text-[13px] ${showArchived ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400"}`}><Archive className="size-[15px]" /><span className="flex-1">Arquivadas</span><span className="text-[11px] text-zinc-500">{chat.conversations.filter((conversation) => conversation.archived).length}</span></button>}
          </header>
          <CompactScrollArea className="flex-1" label={membersOpen ? "Membros da empresa" : "Lista de conversas"}><div className={collapsed ? "space-y-1 py-3 pr-1 pl-3" : "px-2 pb-2"}>
            {membersOpen ? <>{memberResults.map((member) => <button key={member.userId} type="button" onClick={() => void startDirect(member.userId)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left hover:bg-white/[0.05]"><Avatar name={member.displayName || member.user.name} image={member.user.image} className="size-12 lg:size-10" /><span className="min-w-0"><strong className="block truncate text-sm text-zinc-100">{member.displayName || member.user.name}</strong><span className="block truncate text-xs text-zinc-500">{member.user.email}</span></span></button>)}{!memberResults.length && <p className="py-10 text-center text-[13px] text-zinc-500">Nenhum membro encontrado</p>}</> : <>{conversations.map((conversation) => { const name = conversationName(conversation, userId, chat.members); const selected = conversation.id === chat.selectedId; return <div key={conversation.id} className={`group relative rounded-none border-b border-white/[0.08] transition-colors lg:rounded-xl lg:border-b-0 ${selected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}`}><button type="button"
                    onMouseDown={(event) => startPreviewHold(conversation, event)}
                    onMouseLeave={() => cancelPreviewHold(conversation.id)}
                    onPointerDown={(event) => startTouchPreviewHold(conversation, event)}
                    onPointerMove={(event) => moveTouchPreviewHold(conversation.id, event)}
                    onPointerUp={(event) => { if (touchHoldRef.current?.pointerId === event.pointerId) cancelPreviewHold(conversation.id); }}
                    onPointerCancel={() => cancelPreviewHold(conversation.id)}
                    onContextMenu={(event) => {
                      if (event.button === 2 || !window.matchMedia("(min-width: 1024px)").matches) {
                        event.preventDefault();
                        if (!window.matchMedia("(min-width: 1024px)").matches) activateTouchPreviewHold(conversation);
                      }
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => selectConversationFromClick(conversation, event)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`${name}${conversation.unreadCount ? `, ${conversation.unreadCount} mensagens não lidas` : ""}`}
                    title={`${name} — Toque para abrir; pressione e segure para ver a prévia`}
                    className={`block w-full select-none text-left focus-visible:outline-2 focus-visible:outline-zinc-400 max-lg:touch-pan-y max-lg:[-webkit-touch-callout:none] ${collapsed ? "rounded-xl py-2" : "px-2"}`}><div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}><span className="relative shrink-0"><Avatar name={name} image={conversationImage(conversation, userId)} group={conversation.type === "GROUP"} className="size-12 lg:size-10" />
                      {holdingConversationId === conversation.id && (
                        <svg className="pointer-events-none absolute -inset-1 size-14 -rotate-90 lg:size-12" viewBox="0 0 48 48" aria-hidden="true">
                          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20" />
                          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset="100" className="text-white" style={{ animation: `conversation-preview-hold ${previewHoldDuration}ms linear forwards` }} onAnimationEnd={() => completePreviewHold(conversation)} />
                        </svg>
                      )}{collapsed && !!conversation.unreadCount && <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#09090b] bg-zinc-300 px-1 text-[9px] font-bold text-zinc-950">{conversation.unreadCount}</span>}</span>{!collapsed && <div className="min-w-0 flex-1 py-3 lg:py-2"><div className="flex items-baseline justify-between gap-3"><p className="min-w-0 flex-1 truncate text-base font-medium leading-tight text-zinc-50 lg:text-[14px]">{name}</p>{conversation.lastMessage && <time className={`shrink-0 text-xs lg:text-[11px] ${conversation.unreadCount ? "text-zinc-300" : "text-zinc-500"}`}>{sidebarDate(conversation.lastMessage.createdAt)}</time>}</div><div className="mt-0.5 flex items-center gap-2 pr-7"><p className="min-w-0 flex-1 truncate text-sm leading-tight text-zinc-400 lg:text-[12px] lg:text-zinc-500">{conversation.lastMessage && !conversation.lastMessage.deletedAt && conversation.lastMessage.senderId === userId && "✓✓ "}<MessageText content={conversation.lastMessage ? conversation.lastMessage.deletedAt ? "Mensagem apagada" : conversation.lastMessage.content : "Nenhuma mensagem"} showSignature={Boolean(conversation.lastMessage && !conversation.lastMessage.deletedAt && !conversation.lastMessage.private && conversation.lastMessage.senderId === userId)} linkify={false} /></p>{!!conversation.unreadCount && <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-300 px-1.5 text-[10px] font-semibold text-zinc-950">{conversation.unreadCount}</span>}{conversation.pinned && <Pin className="size-3 shrink-0 text-zinc-500" fill="currentColor" />}</div></div>}</div></button>{!collapsed && <div className="absolute right-2 bottom-1.5 z-30"><button type="button" onClick={() => setRowMenuId(rowMenuId === conversation.id ? null : conversation.id)} aria-label={`Ações da conversa com ${name}`} aria-expanded={rowMenuId === conversation.id} className={`flex size-6 items-center justify-center text-zinc-500 hover:text-white ${rowMenuId === conversation.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}><ChevronDown className="size-3.5" /></button>{rowMenuId === conversation.id && <div role="menu" className="absolute top-[calc(100%+0.4rem)] right-0 z-50 w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 text-sm shadow-2xl"><button type="button" role="menuitem" onClick={() => selectConversation(conversation.id)} className={menuItemClass}><MessageCircle className="size-4" /> Abrir conversa</button><button type="button" role="menuitem" onClick={() => void updatePreference(conversation, "pinned")} className={menuItemClass}>{conversation.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{conversation.pinned ? "Desafixar conversa" : "Fixar conversa"}</button><button type="button" role="menuitem" onClick={() => void updatePreference(conversation, "archived")} className={menuItemClass}>{conversation.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}{conversation.archived ? "Desarquivar conversa" : "Arquivar conversa"}</button></div>}</div>}</div>; })}{memberContacts.map((member) => <MemberContactRow key={member.userId} member={member} collapsed={collapsed} onOpen={() => void startDirect(member.userId)} />)}{chat.loading && <p className="py-10 text-center text-[13px] text-zinc-500">Carregando contatos e conversas...</p>}{!chat.loading && chat.error && <div role="alert" className="px-4 py-8 text-center text-[13px] text-red-300"><p>{chat.error}</p><button type="button" onClick={() => void chat.reload()} className="mt-3 rounded-lg border border-white/20 px-3 py-1.5 text-zinc-100 hover:bg-white/10">Tentar novamente</button></div>}{!chat.loading && !chat.error && !conversations.length && !memberContacts.length && <p className="py-10 text-center text-[13px] text-zinc-500">{showArchived ? "Nenhuma conversa arquivada" : "Nenhum chat ou membro encontrado"}</p>}</>}
          </div></CompactScrollArea>
          <InternalConversationPreview
            conversation={previewConversation}
            name={previewConversation ? conversationName(previewConversation, userId, chat.members) : ""}
            image={previewConversation ? conversationImage(previewConversation, userId) : null}
            userId={userId}
            messages={previewMessages}
            loading={previewLoading}
            error={previewError}
            panelRef={previewPanelRef}
            onOpenConversation={selectConversation}
          />
          {!collapsed && <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3 text-xs text-zinc-500"><button type="button" onClick={() => setGroupOpen(true)} className="hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-400">Novo grupo</button><Link href="/empresa" className="hover:text-zinc-200">Gerenciar empresa</Link></div>}
        </aside>
      </div>

      <section ref={setConversationPanel} className={`@container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${sidebarVisible ? "max-lg:invisible" : ""}`}>
        {!chat.selected ? <div className="flex flex-1 flex-col items-center justify-center gap-4 text-zinc-500"><EmptyChatAnimation /><p>Selecione uma conversa para começar</p></div> : <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('/mesh-gradient2.png')" }} /><div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-zinc-950/50" />
          <header className="pointer-events-auto relative z-20 flex h-[calc(64px+env(safe-area-inset-top))] shrink-0 items-center gap-1.5 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 sm:gap-3 sm:px-4"><div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[200px] bg-gradient-to-b from-black/65 via-black/30 to-transparent [mask-image:linear-gradient(to_bottom,black_0%,black_35%,transparent_100%)]" />{searchOpen ? <><label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3"><Search className="size-4 text-zinc-400" /><input autoFocus type="search" value={searchText} onChange={(event) => { setSearchText(event.target.value); setSearchIndex(0); }} placeholder="Localizar mensagem..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500" /></label><span className="text-xs text-zinc-400">{searchResults.length ? searchIndex + 1 : 0}/{searchResults.length}</span><button type="button" onClick={() => setSearchIndex((index) => (index - 1 + searchResults.length) % searchResults.length)} disabled={!searchResults.length} aria-label="Resultado anterior" className="rounded-full p-2 hover:bg-white/10">↑</button><button type="button" onClick={() => setSearchIndex((index) => (index + 1) % searchResults.length)} disabled={!searchResults.length} aria-label="Próximo resultado" className="rounded-full p-2 hover:bg-white/10">↓</button><button type="button" onClick={() => { setSearchOpen(false); setSearchText(""); }} aria-label="Fechar busca" className="rounded-full p-2 hover:bg-white/10"><X className="size-5" /></button></> : <><button type="button" onClick={() => setMobileListOpen(true)} aria-label="Voltar para conversas" className="flex size-10 items-center justify-center rounded-full text-zinc-200 hover:bg-white/[0.07] lg:hidden"><ArrowLeft className="size-5" /></button><button type="button" onClick={() => setInfoOpen(true)} aria-label={`Abrir informações de ${selectedName}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left sm:gap-3"><Avatar name={selectedName} image={selectedImage} group={chat.selected.type === "GROUP"} /><span className="min-w-0 flex-1"><span className="block truncate text-base font-medium lg:text-[15px]">{selectedName}</span>{chat.typingUserId ? <span className="block text-xs text-zinc-300">digitando…</span> : <span className="block truncate text-xs text-zinc-400">{chat.selected.type === "GROUP" ? `${chat.selected.participants.length} participantes` : (selectedContact?.email || "Conversa individual")}</span>}</span></button><div className="ml-auto flex h-11 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.035] px-1"><button type="button" onClick={openAddMembers} aria-label={chat.selected.type === "GROUP" ? "Adicionar participantes" : "Criar grupo com esta pessoa"} title={chat.selected.type === "GROUP" ? "Adicionar participantes" : "Criar grupo com esta pessoa"} className="flex size-9 items-center justify-center rounded-full text-zinc-300 hover:bg-white/[0.07]"><UserRoundPlus className="size-5" /></button><div className="relative"><button type="button" onClick={() => setHeaderMenuOpen((open) => !open)} aria-label="Mais opções" aria-expanded={headerMenuOpen} className="flex size-9 items-center justify-center rounded-full text-zinc-300 hover:bg-white/[0.07]"><EllipsisVertical className="size-5" /></button>{headerMenuOpen && <div role="menu" className="absolute top-[calc(100%+0.55rem)] right-0 z-50 w-56 rounded-xl border border-white/10 bg-zinc-950 p-1.5 text-sm shadow-2xl"><button type="button" role="menuitem" onClick={() => { setSearchOpen(true); setHeaderMenuOpen(false); }} className={menuItemClass}><Search className="size-4 text-zinc-400" /> Localizar mensagem</button><button type="button" role="menuitem" onClick={() => { setInfoOpen(true); setHeaderMenuOpen(false); }} className={menuItemClass}><Info className="size-4 text-zinc-400" /> Informações da conversa</button></div>}</div><button type="button" onClick={() => setInfoOpen(true)} aria-label="Informações da conversa" className="flex size-9 items-center justify-center rounded-full text-zinc-300 hover:bg-white/[0.07]"><Info className="size-5" /></button></div></>}</header>
          <div ref={scrollRef} onScroll={(event) => { const target = event.currentTarget; const distance = target.scrollHeight - target.clientHeight - target.scrollTop; nearBottomRef.current = distance < 80; setShowScrollButton(distance > 180); if (target.scrollTop < 80) void loadOlderMessages(); }} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none"><div className="flex min-h-full flex-col gap-2 px-2 pt-2 pb-28 sm:px-5">{chat.loadingOlderMessages && <p className="py-2 text-center text-xs text-zinc-400">Carregando mensagens anteriores...</p>}{chat.loadingMessages && <p className="py-2 text-center text-xs text-zinc-400">Carregando histórico...</p>}{chat.messages.map((message, index) => { const own = message.senderId === userId; const previous = chat.messages[index - 1]; const separator = !previous || dayFormatter.format(new Date(previous.createdAt)) !== dayFormatter.format(new Date(message.createdAt)); return <motion.div key={message.id} id={`internal-message-${message.id}`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative flex w-full flex-col gap-2"><>{separator && <div role="separator" aria-label={dateLabel(message.createdAt)} className="flex justify-center py-1"><span className="rounded-md border border-white/[0.06] bg-zinc-900/90 px-2.5 py-1 text-xs font-medium text-zinc-300 shadow-sm lg:text-[10px]">{dateLabel(message.createdAt)}</span></div>}</><div className={`group/message flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}>{!own && <Avatar name={message.sender.name} image={message.sender.image} className="size-8 lg:size-9" />}<div className={`relative min-w-0 max-w-[86%] text-base leading-[1.45] [overflow-wrap:anywhere] lg:max-w-[min(62%,620px)] lg:text-[13.5px] lg:leading-[1.4] ${message.private ? "rounded-[24px] bg-zinc-100 px-3.5 py-2.5 text-zinc-900" : message.type === "FILE" && !message.deletedAt ? "rounded-[18px] bg-zinc-800 p-[3px] text-white shadow-[0_3px_12px_rgba(0,0,0,0.16)]" : "rounded-[24px] bg-zinc-800 px-3.5 py-2.5 text-white"}`} onContextMenu={(event) => { event.preventDefault(); setMessageMenuId(message.id); }}>{message.private && <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-zinc-600"><LockKeyhole className="size-3" /> Privado</p>}{chat.selected?.type === "GROUP" && !own && <p className="mb-1 text-[11px] font-semibold text-zinc-300">{message.sender.name}</p>}{message.replyTo && <button type="button" onClick={() => document.getElementById(`internal-message-${message.replyTo?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mb-2 block w-full rounded border-l-2 border-zinc-400 bg-black/15 px-2 py-1 text-left text-xs"><span className="block font-medium text-zinc-300">{message.replyTo.sender.name}</span><span className="block truncate text-zinc-400">{message.replyTo.content}</span></button>}{message.type === "FILE" && message.media && !message.deletedAt && chat.organizationId && chat.selectedId
  ? <InternalMediaContent message={message} messages={chat.messages} organizationId={chat.organizationId} conversationId={chat.selectedId} currentUserId={userId} />
  : <div className="whitespace-pre-wrap break-words"><MessageText content={message.deletedAt ? "Mensagem apagada" : message.content} showSignature={own && !message.private} /></div>}<div className={message.type === "FILE" && !message.deletedAt && /^(image|video)\//.test(message.media?.mimeType ?? "") ? "absolute right-2 bottom-2 flex items-center justify-end gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white/85" : message.private ? "mt-1 flex items-center justify-end gap-1.5 text-[9px] text-zinc-500" : "mt-1 flex items-center justify-end gap-1.5 text-[9px] text-white/55"}><time dateTime={message.createdAt}>{timeFormatter.format(new Date(message.createdAt))}</time>{own && <CheckCheck className="size-3" />}</div>{message.reactions.length > 0 && <div className="absolute -bottom-3 right-2 flex gap-0.5 rounded-full border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-xs">{message.reactions.map((reaction) => <button key={reaction.userId} type="button" onClick={() => void chat.react(message.id, reaction.emoji)} aria-label={`Reagir com ${reaction.emoji}`}>{reaction.emoji}</button>)}</div>}{messageMenuId === message.id && <div role="menu" className="absolute top-full right-0 z-30 mt-2 w-48 rounded-xl border border-white/10 bg-zinc-950 p-1.5 text-sm shadow-2xl"><div className="flex gap-1 px-1 pb-1">{["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => <button key={emoji} type="button" onClick={() => { void chat.react(message.id, emoji); setMessageMenuId(null); }} className="rounded-full p-1 hover:bg-white/10">{emoji}</button>)}</div><button type="button" role="menuitem" onClick={() => { setReplyTo(message); setMessageMenuId(null); }} className={menuItemClass}><Reply className="size-4" /> Responder</button><button type="button" role="menuitem" onClick={() => { void navigator.clipboard.writeText(message.content); setMessageMenuId(null); }} className={menuItemClass}><Copy className="size-4" /> Copiar</button>{own && <button type="button" role="menuitem" onClick={() => void deleteMessage(message)} className={menuItemClass}><Trash2 className="size-4" /> Apagar mensagem</button>}</div>}</div>{own && <Avatar name={message.sender.name} image={message.sender.image} className="size-8 lg:size-9" />}<button type="button" onClick={() => setMessageMenuId(messageMenuId === message.id ? null : message.id)} aria-label="Ações da mensagem" className="self-center rounded-full p-1 text-zinc-500 opacity-0 hover:bg-white/10 group-hover/message:opacity-100 focus-visible:opacity-100"><ChevronDown className="size-4" /></button></div></motion.div>; })}{chat.typingUserId && <p className="self-start rounded-full bg-white/[0.05] px-3 py-1 text-xs text-zinc-400">digitando…</p>}</div></div>
          {showScrollButton && <button type="button" onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })} aria-label="Ir para a mensagem mais recente" className="absolute bottom-24 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/15 bg-zinc-900/90 text-zinc-200 shadow-lg"><ArrowDown className="size-5" /></button>}
          <MessageComposer
            key={chat.selectedId}
            mode="internal"
            userId={userId ?? ""}
            dropZoneContainer={conversationPanel}
            text={text}
            sending={chat.sending}
            closing={false}
            onTextChange={(value) => { setText(value); chat.sendTyping(Boolean(value)); }}
            onSend={(options) => void submitMessage(options)}
            onSendMedia={async (files, caption, includeSignature) => {
              await chat.sendMedia(files, caption ?? "", replyTo?.id, includeSignature);
              setReplyTo(null);
              chat.sendTyping(false);
            }}
            onCloseWithBot={() => undefined}
            allowCloseWithBot={false}
            internalMentionUsers={chat.selected.participants.map((participant) => ({ id: participant.user.id, name: participant.user.name, image: participant.user.image ?? null }))}
            replyingTo={composerReply(replyTo, userId)}
            replyMediaUrl={(id) => internalMediaUrl(chat.organizationId!, chat.selectedId!, id)}
            onCancelReply={() => setReplyTo(null)}
            focusRequestKey={0}
          />
        </>}
        <AnimatePresence>{infoOpen && chat.selected && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex justify-end bg-black/50" onClick={(event) => { if (event.target === event.currentTarget) setInfoOpen(false); }}><aside className="h-full w-full max-w-[360px] overflow-y-auto border-l border-white/10 bg-zinc-950 p-5"><button type="button" onClick={() => setInfoOpen(false)} aria-label="Fechar informações" className="ml-auto flex size-9 items-center justify-center rounded-full hover:bg-white/10"><X className="size-5" /></button><div className="mt-6 flex flex-col items-center gap-3"><Avatar name={selectedName} image={selectedImage} group={chat.selected.type === "GROUP"} className="size-24" /><h2 className="text-lg font-semibold">{selectedName}</h2><p className="text-sm text-zinc-500">{chat.selected.type === "GROUP" ? "Grupo interno" : "Conversa individual"}</p></div><h3 className="mt-9 mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Participantes</h3>{chat.selected.participants.map((participant) => <div key={participant.user.id} className="flex items-center gap-3 border-b border-white/[0.06] py-3"><Avatar name={participant.user.name} image={participant.user.image} /><span className="min-w-0"><strong className="block truncate text-sm">{participant.user.name}{participant.user.id === userId ? " (você)" : ""}</strong><span className="block truncate text-xs text-zinc-500">{participant.user.email}</span></span></div>)}</aside></motion.div>}</AnimatePresence>
      </section>
      {groupOpen && <div role="dialog" aria-modal="true" aria-labelledby="new-group-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="new-group-title" className="text-lg font-semibold">Novo grupo</h2><button type="button" onClick={() => setGroupOpen(false)} aria-label="Fechar" className="rounded-full p-2 hover:bg-white/10"><X className="size-5" /></button></div><label className="mt-5 block text-xs text-zinc-400">Nome do grupo<input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-white/30" /></label><p className="mt-5 mb-2 text-xs text-zinc-400">Participantes</p><div className="max-h-56 overflow-y-auto">{chat.members.filter((member) => member.userId !== userId).map((member) => <label key={member.userId} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"><input type="checkbox" checked={groupMemberIds.includes(member.userId)} onChange={(event) => setGroupMemberIds((current) => event.target.checked ? [...current, member.userId] : current.filter((id) => id !== member.userId))} className="accent-zinc-200" /><Avatar name={member.displayName || member.user.name} image={member.user.image} className="size-8" /><span className="text-sm">{member.displayName || member.user.name}</span></label>)}</div><button type="button" onClick={() => void createGroup()} disabled={!groupName.trim() || !groupMemberIds.length} className="mt-5 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">Criar grupo</button></div></div>}
      {addMembersOpen && chat.selected && <div role="dialog" aria-modal="true" aria-labelledby="add-members-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="add-members-title" className="text-lg font-semibold">Adicionar participantes</h2><button type="button" onClick={() => setAddMembersOpen(false)} aria-label="Fechar" className="rounded-full p-2 hover:bg-white/10"><X className="size-5" /></button></div><div className="mt-5 max-h-64 overflow-y-auto">{chat.members.filter((member) => !chat.selected?.participants.some((participant) => participant.user.id === member.userId)).map((member) => <label key={member.userId} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"><input type="checkbox" checked={addMemberIds.includes(member.userId)} onChange={(event) => setAddMemberIds((current) => event.target.checked ? [...current, member.userId] : current.filter((id) => id !== member.userId))} className="accent-zinc-200" /><Avatar name={member.displayName || member.user.name} image={member.user.image} className="size-8" /><span className="text-sm">{member.displayName || member.user.name}</span></label>)}</div><button type="button" onClick={() => void addMembers()} disabled={!addMemberIds.length} className="mt-5 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">Adicionar</button></div></div>}
      {actionError && <div role="alert" className="fixed right-4 bottom-4 z-[60] max-w-sm rounded-xl border border-red-400/25 bg-zinc-900 px-4 py-3 text-sm text-red-300 shadow-xl"><button type="button" onClick={() => setActionError(null)} aria-label="Fechar erro" className="float-right ml-3"><X className="size-4" /></button>{actionError}</div>}
    </main>
  );
}
