"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CheckCheck, MessageCircle, Paperclip, PanelLeftClose, Plus, Reply, Search, Send, Smile, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useInternalChat } from "@/hooks/use-internal-chat";
import { useSession } from "@/lib/auth-client";
import type { InternalConversation, InternalMessage } from "@/lib/internal-chat-api";
import { ChatNavigationRail } from "@/components/chat/chat-navigation-rail";

function displayName(conversation: InternalConversation, userId?: string) {
  if (conversation.type === "GROUP") return conversation.name || "Grupo sem nome";
  return conversation.participants.find((participant) => participant.user.id !== userId)?.user.name
    ?? conversation.participants[0]?.user.name
    ?? "Conversa";
}

function Avatar({ name, image, group = false }: { name: string; image?: string | null; group?: boolean }) {
  return image
    ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className="size-10 shrink-0 rounded-full object-cover" />
    )
    : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">{group ? <UsersRound className="size-4" /> : name.slice(0, 1).toUpperCase()}</span>;
}

function ConversationRow({ conversation, userId, selected, onClick }: { conversation: InternalConversation; userId?: string; selected: boolean; onClick: () => void }) {
  const name = displayName(conversation, userId);
  const participant = conversation.participants.find((item) => item.user.id !== userId)?.user;
  return (
    <button type="button" onClick={onClick} className={`flex h-[51px] w-full items-center gap-2.5 px-4 text-left transition-colors ${selected ? "bg-white/[0.1]" : "hover:bg-white/[0.05]"}`}>
      <Avatar name={name} image={conversation.type === "GROUP" ? conversation.avatarUrl : participant?.image} group={conversation.type === "GROUP"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <strong className="truncate text-[15px] font-semibold text-zinc-100">{name}</strong>
          {conversation.lastMessage && <time className="shrink-0 text-[10px] text-zinc-500">{new Date(conversation.lastMessage.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-0.5 truncate text-xs text-zinc-500">
            {conversation.lastMessage && <CheckCheck aria-hidden="true" className="size-3 shrink-0 text-zinc-500" strokeWidth={2} />}
            <span className="truncate">{conversation.lastMessage?.content || "Nenhuma mensagem ainda"}</span>
          </span>
          {!!conversation.unreadCount && <span className="flex size-5 items-center justify-center rounded-full bg-violet-400 text-[10px] font-bold text-zinc-950">{conversation.unreadCount}</span>}
        </span>
      </span>
    </button>
  );
}

export function InternalChatWorkspace() {
  const router = useRouter();
  const { data: session } = useSession();
  const chat = useInternalChat();
  const sessionUserId = session?.user.id;
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<InternalMessage | null>(null);
  const [tab, setTab] = useState<"mine" | "groups" | "conversations">("conversations");
  const filteredConversations = useMemo(() => chat.conversations.filter((conversation) => {
    if (tab === "groups" && conversation.type !== "GROUP") return false;
    if (tab === "conversations" && conversation.type !== "GROUP") return false;
    if (tab === "mine" && conversation.type !== "DIRECT") return false;
    const name = displayName(conversation, sessionUserId).toLowerCase();
    return !query.trim() || name.includes(query.toLowerCase()) || conversation.lastMessage?.content.toLowerCase().includes(query.toLowerCase());
  }), [chat.conversations, query, sessionUserId, tab]);
  const selectedName = chat.selected ? displayName(chat.selected, sessionUserId) : "Chat interno";
  const selectedParticipant = chat.selected?.participants.find((participant) => participant.user.id !== sessionUserId)?.user;

  async function submitMessage() {
    if (!text.trim()) return;
    const content = text;
    setText("");
    setReplyTo(null);
    await chat.sendMessage(content, replyTo?.id);
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-[#09090b] text-white">
      <div className="max-lg:hidden">
        <ChatNavigationRail
          activeSection="conversations"
          unreadCount={chat.conversations.reduce((total, conversation) => total + (conversation.unreadCount ?? 0), 0)}
          notificationUnreadCount={0}
          onNavigate={(section) => { if (section === "conversations") router.push("/"); }}
          onOpenSettings={() => undefined}
        />
      </div>
      <aside className={`flex w-full max-w-[360px] shrink-0 flex-col border-r border-white/[0.08] bg-[#09090b] max-lg:absolute max-lg:inset-0 max-lg:z-20 max-lg:max-w-none ${mobileListOpen ? "max-lg:visible" : "max-lg:invisible"}`}>
        <header className="border-b border-white/[0.08] px-4 pb-3 pt-[calc(1.75rem+env(safe-area-inset-top))] sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-[17px] font-semibold tracking-tight text-zinc-100">CotrimBot</p>
            </div>
            <div className="mr-1 flex items-center gap-[6px] text-zinc-500">
              <span aria-hidden="true" className="flex size-8 items-center justify-center"><Plus className="size-[19px]" strokeWidth={1.8} /></span>
              <Link href="/" aria-label="Voltar para o WhatsApp" title="Voltar para o WhatsApp" className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/[0.08] hover:text-white"><PanelLeftClose className="size-[17px]" strokeWidth={1.7} /></Link>
            </div>
          </div>
          <label className="mt-4 flex h-[34px] items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.045] px-3 text-zinc-500 shadow-inner shadow-black/20">
            <Search className="size-[15px]" strokeWidth={2} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar conversas" className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-400" />
          </label>
          <div className="mt-3 flex">
            {(["mine", "groups", "conversations"] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`relative flex-1 pb-2 text-[13px] font-medium transition-colors ${tab === item ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>{item === "groups" ? "Grupos" : item === "mine" ? "Minhas" : "Conversas"}{tab === item && <span className="absolute bottom-0 left-1/2 h-px w-[70px] -translate-x-1/2 bg-zinc-100" />}</button>)}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chat.loading && <p className="p-5 text-sm text-zinc-500">Carregando conversas...</p>}
          {!chat.loading && !filteredConversations.length && <div className="p-5 text-sm text-zinc-500"><p>Nenhuma conversa encontrada.</p><p className="mt-2 text-xs text-zinc-600">Selecione um membro abaixo para iniciar uma conversa.</p></div>}
          {filteredConversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} userId={session?.user.id} selected={conversation.id === chat.selectedId} onClick={() => { chat.selectConversation(conversation.id); setMobileListOpen(false); }} />)}
          <div className="border-t border-white/[0.08] p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Membros da empresa</p>
            {chat.members.filter((member) => member.user.id !== session?.user.id && (!query || (member.displayName || member.user.name).toLowerCase().includes(query.toLowerCase()))).map((member) => <button key={member.userId} type="button" onClick={() => { void chat.startDirect(member.userId); setMobileListOpen(false); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]"><Avatar name={member.displayName || member.user.name} image={member.user.image} /><span className="min-w-0"><strong className="block truncate text-sm text-zinc-200">{member.displayName || member.user.name}</strong><span className="block truncate text-xs text-zinc-600">{member.user.email}</span></span></button>)}
          </div>
        </div>
        <Link href="/empresa" className="flex items-center gap-2 border-t border-white/[0.08] px-5 py-3 text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-white"><Building2 className="size-4" /> Gerenciar empresa</Link>
      </aside>

      <section className={`flex min-w-0 flex-1 flex-col max-lg:absolute max-lg:inset-0 max-lg:z-10 max-lg:bg-zinc-950 ${mobileListOpen ? "max-lg:invisible" : "max-lg:visible"}`}>
        {!chat.selected ? <div className="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-600"><MessageCircle className="size-12 stroke-1" /><p>Escolha uma conversa para começar</p></div> : <>
          <header className="flex items-center gap-3 border-b border-white/[0.08] bg-[#171717] px-3 py-3">
            <button type="button" onClick={() => setMobileListOpen(true)} aria-label="Voltar para conversas" className="rounded-full p-2 text-zinc-400 hover:bg-white/[0.08] hover:text-white lg:hidden"><ArrowLeft className="size-5" /></button>
            <Avatar name={selectedName} image={chat.selected?.type === "GROUP" ? chat.selected.avatarUrl : selectedParticipant?.image} group={chat.selected?.type === "GROUP"} />
            <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-zinc-100">{selectedName}</h2><p className="text-xs text-zinc-500">{chat.selected?.type === "GROUP" ? `${chat.selected.participants.length} participantes` : "Conversa individual"}</p></div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
            {chat.loadingMessages && <p className="text-center text-xs text-zinc-600">Carregando histórico...</p>}
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {chat.messages.map((message) => {
                const own = message.sender.id === session?.user.id;
                return <div key={message.id} className={`group flex ${own ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[min(80%,560px)] rounded-2xl px-3.5 py-2.5 ${own ? "rounded-br-sm bg-violet-500/20 text-zinc-100" : "rounded-bl-sm bg-white/[0.07] text-zinc-200"}`}>
                    {chat.selected?.type === "GROUP" && !own && <p className="mb-1 text-[11px] font-semibold text-violet-300">{message.sender.name}</p>}
                    {message.replyTo && <button type="button" onClick={() => document.getElementById(`internal-message-${message.replyTo?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mb-2 block w-full border-l-2 border-violet-300/60 pl-2 text-left text-xs text-zinc-500"><span className="block font-medium text-violet-300">{message.replyTo.sender.name}</span>{message.replyTo.content}</button>}
                    <p id={`internal-message-${message.id}`} className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                    <div className="mt-1 flex items-center justify-end gap-2"><time className="text-[10px] text-zinc-600">{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>{own && <CheckCheck className="size-3 text-violet-300" />}</div>
                    <div className="mt-1 flex items-center gap-1">{message.reactions.map((reaction) => <button key={reaction.userId} type="button" onClick={() => void chat.react(message.id, reaction.emoji)} className="rounded-full bg-black/20 px-1.5 py-0.5 text-xs">{reaction.emoji}</button>)}<button type="button" onClick={() => void chat.react(message.id, "👍")} className="ml-1 hidden rounded-full bg-black/20 p-1 text-zinc-500 group-hover:block" aria-label="Reagir"><Smile className="size-3" /></button><button type="button" onClick={() => setReplyTo(message)} className="hidden rounded-full bg-black/20 p-1 text-zinc-500 group-hover:block" aria-label="Responder"><Reply className="size-3" /></button></div>
                  </div>
                </div>;
              })}
              {chat.typingUserId && <p className="text-xs italic text-zinc-600">Alguém está digitando...</p>}
            </div>
          </div>
          <div className="border-t border-white/[0.08] bg-[#171717] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-8">
            <div className="mx-auto max-w-3xl">
              {replyTo && <div className="mb-2 flex items-center justify-between rounded-lg border-l-2 border-violet-400 bg-black/20 px-3 py-2 text-xs text-zinc-400"><span className="truncate">Respondendo: {replyTo.content}</span><button type="button" onClick={() => setReplyTo(null)} className="px-2 text-zinc-500">×</button></div>}
              <div className="flex items-end gap-2 rounded-xl border border-white/[0.1] bg-black/30 p-2">
                <button type="button" disabled title="Anexos serão habilitados após configurar armazenamento persistente" className="rounded-lg p-2 text-zinc-600"><Paperclip className="size-5" /></button>
                <textarea value={text} onChange={(event) => { setText(event.target.value); chat.sendTyping(true); }} onBlur={() => chat.sendTyping(false)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} placeholder="Digite uma mensagem..." rows={1} className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
                <button type="button" onClick={() => void submitMessage()} disabled={!text.trim() || chat.sending} className="rounded-lg bg-violet-400 p-2 text-zinc-950 transition-opacity disabled:opacity-30" aria-label="Enviar mensagem"><Send className="size-4" /></button>
              </div>
            </div>
          </div>
        </>}
      </section>
    </main>
  );
}
