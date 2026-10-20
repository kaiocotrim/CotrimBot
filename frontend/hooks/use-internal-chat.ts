"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { socket } from "@/lib/socket";
import { getCachedInternalChatBootstrap, internalChatApi, type InternalConversation, type InternalMember, type InternalMessage } from "@/lib/internal-chat-api";

type InternalChatOptions = {
  activeOrganizationId?: string | null;
  currentUserId?: string | null;
};

export function useInternalChat({ activeOrganizationId, currentUserId }: InternalChatOptions = {}) {
  const cachedBootstrap = getCachedInternalChatBootstrap(activeOrganizationId);
  const [organizationId, setOrganizationId] = useState<string | null>(activeOrganizationId ?? null);
  const [conversations, setConversations] = useState<InternalConversation[]>(cachedBootstrap?.conversations ?? []);
  const [members, setMembers] = useState<InternalMember[]>(cachedBootstrap?.members ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(cachedBootstrap?.initialConversationId ?? null);
  const [messages, setMessages] = useState<InternalMessage[]>(cachedBootstrap?.initialMessages ?? []);
  const [loading, setLoading] = useState(!cachedBootstrap);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(cachedBootstrap?.initialMessagesHasMore ?? false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ organizationId: string; conversationId: string; userIds: string[] } | null>(null);
  const outgoingTyping = useRef({ active: false, lastSentAt: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const typingUserIds = typingUsers?.organizationId === organizationId && typingUsers.conversationId === selectedId ? typingUsers.userIds : [];
  const typingUserId = typingUserIds[0] ?? null;
  const currentUserIdRef = useRef<string | null>(currentUserId ?? null);
  const selectedIdRef = useRef<string | null>(cachedBootstrap?.initialConversationId ?? null);
  const bootstrappedRef = useRef(Boolean(cachedBootstrap));
  const hydratedMessageConversationIdRef = useRef<string | null>(cachedBootstrap?.initialConversationId ?? null);

  const selected = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? null, [conversations, selectedId]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { currentUserIdRef.current = currentUserId ?? null; }, [currentUserId]);

  const reload = useCallback(async () => {
    setLoading(!getCachedInternalChatBootstrap(activeOrganizationId));
    setError(null);
    try {
      let nextOrganizationId = activeOrganizationId ?? null;
      if (!nextOrganizationId) {
        const organizationResponse = await authClient.organization.list();
        if (organizationResponse.error) {
          throw new Error(organizationResponse.error.message || "Não foi possível carregar as empresas.");
        }
        nextOrganizationId = (organizationResponse.data as Array<{ id: string }> | null)?.[0]?.id ?? null;
      }
      if (!nextOrganizationId) {
        setOrganizationId(null);
        setConversations([]);
        setMembers([]);
        setError("Você ainda não participa de uma empresa. Entre em uma empresa para ver os contatos internos.");
        return;
      }
      setOrganizationId(nextOrganizationId);
      const existingCache = getCachedInternalChatBootstrap(nextOrganizationId);
      const result = await internalChatApi.bootstrap(nextOrganizationId, Boolean(existingCache));
      setMembers(result.members);
      setConversations(result.conversations);
      const requestedId = new URLSearchParams(window.location.search).get("conversationId");
      const requested = result.conversations.find((item) => item.id === requestedId);
      const nextSelectedId = requested?.id ?? selectedIdRef.current ?? result.initialConversationId;
      if (!bootstrappedRef.current && nextSelectedId === result.initialConversationId) {
        hydratedMessageConversationIdRef.current = result.initialConversationId;
        setMessages(result.initialMessages);
        setHasOlderMessages(result.initialMessagesHasMore);
      }
      bootstrappedRef.current = true;
      selectedIdRef.current = nextSelectedId;
      setSelectedId(nextSelectedId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o chat interno.");
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [reload]);

  useEffect(() => {
    if (!organizationId || !selectedId) {
      queueMicrotask(() => setMessages([]));
      return;
    }
    let active = true;
    const hydrated = hydratedMessageConversationIdRef.current === selectedId;
    queueMicrotask(() => { if (active) { setLoadingMessages(!hydrated); if (!hydrated) { setMessages([]); setHasOlderMessages(false); } } });
    void internalChatApi.messages(organizationId, selectedId)
      .then((result) => { if (active) { hydratedMessageConversationIdRef.current = selectedId; setMessages(result.messages); setHasOlderMessages(result.hasMore); } })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as mensagens."); })
      .finally(() => { if (active) setLoadingMessages(false); });
    void internalChatApi.read(organizationId, selectedId).catch(() => undefined);
    return () => { active = false; };
  }, [organizationId, selectedId]);

  useEffect(() => {
    if (!organizationId) return;
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const removeTypingUser = (userId: string) => {
      const timer = typingTimers.get(userId);
      if (timer) clearTimeout(timer);
      typingTimers.delete(userId);
      setTypingUsers((current) => current?.organizationId === organizationId && current.conversationId === selectedId
        ? { ...current, userIds: current.userIds.filter((id) => id !== userId) } : current);
    };
    const clearTyping = () => {
      for (const timer of typingTimers.values()) clearTimeout(timer);
      typingTimers.clear();
      setTypingUsers(null);
    };
    const addMessage = (payload: { organizationId: string; conversationId: string; message: InternalMessage }) => {
      if (payload.organizationId !== organizationId) return;
      setConversations((current) => current.map((conversation) => conversation.id === payload.conversationId
        ? { ...conversation, updatedAt: payload.message.createdAt, lastMessage: payload.message, unreadCount: conversation.id === selectedId ? 0 : (conversation.unreadCount ?? 0) + (payload.message.senderId === currentUserIdRef.current ? 0 : 1) }
        : conversation));
      if (payload.conversationId !== selectedId) return;
      removeTypingUser(payload.message.senderId);
      setMessages((current) => current.some((message) => message.id === payload.message.id || (message.clientId && message.clientId === payload.message.clientId)) ? current : [...current, payload.message]);
      void internalChatApi.read(organizationId, selectedId).catch(() => undefined);
    };
    const handleDeleted = (payload: { conversationId: string; messageId: number }) => {
      if (payload.conversationId === selectedId) setMessages((current) => current.map((message) => message.id === payload.messageId ? { ...message, content: "", deletedAt: new Date().toISOString() } : message));
      setConversations((current) => current.map((conversation) => conversation.id === payload.conversationId && conversation.lastMessage?.id === payload.messageId ? { ...conversation, lastMessage: null } : conversation));
    };
    const handleTyping = (payload: { organizationId: string; conversationId: string; userId: string }) => {
      if (payload.organizationId !== organizationId || payload.conversationId !== selectedId || payload.userId === currentUserIdRef.current) return;
      setTypingUsers((current) => {
        const userIds = current?.organizationId === organizationId && current.conversationId === selectedId ? current.userIds : [];
        return { organizationId, conversationId: payload.conversationId, userIds: userIds.includes(payload.userId) ? userIds : [...userIds, payload.userId] };
      });
      const timer = typingTimers.get(payload.userId);
      if (timer) clearTimeout(timer);
      typingTimers.set(payload.userId, setTimeout(() => removeTypingUser(payload.userId), 3_500));
    };
    const handleTypingStop = (payload: { organizationId: string; conversationId: string; userId: string }) => {
      if (payload.organizationId === organizationId && payload.conversationId === selectedId) removeTypingUser(payload.userId);
    };
    const handleReaction = (payload: { conversationId: string; messageId: number; reaction: { userId: string; emoji: string } | null; userId?: string }) => {
      if (payload.conversationId !== selectedId) return;
      setMessages((current) => current.map((message) => {
        if (message.id !== payload.messageId) return message;
        const userId = payload.reaction?.userId ?? payload.userId;
        if (!userId) return message;
        const reactions = message.reactions.filter((reaction) => reaction.userId !== userId);
        return { ...message, reactions: payload.reaction ? [...reactions, payload.reaction] : reactions };
      }));
    };
    const handleMessageFlags = (payload: { conversationId: string; messageId: number; pinned: boolean; pinnedUntil: string | null; favorited: boolean }) => {
      if (payload.conversationId !== selectedId) return;
      setMessages((current) => current.map((message) => message.id === payload.messageId
        ? { ...message, pinned: payload.pinned, pinnedUntil: payload.pinnedUntil, favorited: payload.favorited }
        : message));
    };
    const handleConversationRead = (payload: { organizationId: string; conversationId: string; userId: string; lastReadAt: string }) => {
      if (payload.organizationId !== organizationId || !Number.isFinite(Date.parse(payload.lastReadAt))) return;
      setConversations((current) => current.map((conversation) => {
        if (conversation.id !== payload.conversationId) return conversation;
        return {
          ...conversation,
          unreadCount: payload.userId === currentUserIdRef.current ? 0 : conversation.unreadCount,
          participants: conversation.participants.map((participant) => participant.user.id === payload.userId
            && (!participant.lastReadAt || Date.parse(payload.lastReadAt) > Date.parse(participant.lastReadAt))
            ? { ...participant, lastReadAt: payload.lastReadAt } : participant),
        };
      }));
    };
    socket.on("internal:message:new", addMessage);
    socket.on("internal:message:deleted", handleDeleted);
    socket.on("internal:typing:start", handleTyping);
    socket.on("internal:typing:stop", handleTypingStop);
    socket.on("disconnect", clearTyping);
    socket.on("internal:reaction:updated", handleReaction);
    socket.on("internal:message:flags", handleMessageFlags);
    socket.on("internal:conversation:read", handleConversationRead);
    const handleConversationUpdated = (payload: { organizationId: string }) => {
      if (payload.organizationId === organizationId) void reload();
    };
    socket.on("internal:conversation:updated", handleConversationUpdated);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("internal:message:new", addMessage);
      socket.off("internal:message:deleted", handleDeleted);
      socket.off("internal:typing:start", handleTyping);
      socket.off("internal:typing:stop", handleTypingStop);
      socket.off("disconnect", clearTyping);
      for (const timer of typingTimers.values()) clearTimeout(timer);
      queueMicrotask(() => setTypingUsers(null));
      socket.off("internal:reaction:updated", handleReaction);
      socket.off("internal:message:flags", handleMessageFlags);
      socket.off("internal:conversation:read", handleConversationRead);
      socket.off("internal:conversation:updated", handleConversationUpdated);
    };
  }, [organizationId, selectedId, reload]);

  const selectConversation = useCallback((conversationId: string) => {
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation));
  }, []);

  const startDirect = useCallback(async (userId: string) => {
    if (!organizationId) return;
    const result = await internalChatApi.create(organizationId, { type: "DIRECT", participantIds: [userId] });
    setConversations((current) => current.some((conversation) => conversation.id === result.conversation.id) ? current : [result.conversation, ...current]);
    selectedIdRef.current = result.conversation.id;
    setSelectedId(result.conversation.id);
  }, [organizationId]);

  const startGroup = useCallback(async (name: string, participantIds: string[]) => {
    if (!organizationId) return;
    const result = await internalChatApi.create(organizationId, { type: "GROUP", name, participantIds });
    setConversations((current) => [result.conversation, ...current.filter((conversation) => conversation.id !== result.conversation.id)]);
    selectedIdRef.current = result.conversation.id;
    setSelectedId(result.conversation.id);
  }, [organizationId]);

  const addParticipants = useCallback(async (participantIds: string[]) => {
    if (!organizationId || !selectedId) return;
    const result = await internalChatApi.addParticipants(organizationId, selectedId, participantIds);
    setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...result.conversation, pinned: conversation.pinned, archived: conversation.archived, unreadCount: conversation.unreadCount } : conversation));
  }, [organizationId, selectedId]);

  const updatePreferences = useCallback(async (conversationId: string, preferences: { pinned?: boolean; archived?: boolean }) => {
    if (!organizationId) return;
    const result = await internalChatApi.preferences(organizationId, conversationId, preferences);
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, ...result } : conversation));
  }, [organizationId]);

  const updateAvatar = useCallback(async (avatarUrl: string | null) => {
    if (!organizationId || !selectedId) return;
    const result = await internalChatApi.avatar(organizationId, selectedId, avatarUrl);
    setConversations((current) => current.map((conversation) => conversation.id === selectedId
      ? { ...result.conversation, pinned: conversation.pinned, archived: conversation.archived, unreadCount: conversation.unreadCount }
      : conversation));
  }, [organizationId, selectedId]);

  const loadOlderMessages = useCallback(async () => {
    if (!organizationId || !selectedId || !hasOlderMessages || loadingOlderMessages || !messages[0]) return 0;
    setLoadingOlderMessages(true);
    try {
      const result = await internalChatApi.messages(organizationId, selectedId, messages[0].id);
      const older = result.messages.filter((message) => !messages.some((item) => item.id === message.id));
      setMessages((current) => [...older.filter((message) => !current.some((item) => item.id === message.id)), ...current]);
      setHasOlderMessages(result.hasMore);
      return older.length;
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [organizationId, selectedId, hasOlderMessages, loadingOlderMessages, messages]);

  const sendMessage = useCallback(async (content: string, replyToMessageId?: number, options: { private?: boolean; includeSignature?: boolean; mentionedUserIds?: string[] } = {}) => {
    if (!organizationId || !selectedId || !content.trim() || sending) return;
    const clientId = crypto.randomUUID();
    setSending(true);
    try {
      const result = await internalChatApi.send(organizationId, selectedId, { content: content.trim(), clientId, ...(replyToMessageId ? { replyToMessageId } : {}), ...options });
      if (selectedIdRef.current === selectedId) setMessages((current) => current.some((message) => message.id === result.message.id || message.clientId === clientId) ? current : [...current, result.message]);
    } finally {
      setSending(false);
    }
  }, [organizationId, selectedId, sending]);

  const sendMedia = useCallback(async (files: File[], caption: string, replyToMessageId?: number, includeSignature = true) => {
    if (!organizationId || !selectedId || !files.length || sending) return;
    setSending(true);
    try {
      for (const [index, file] of files.entries()) {
        const result = await internalChatApi.sendMedia(organizationId, selectedId, file, index === 0 ? caption : "", index === 0 ? replyToMessageId : undefined, includeSignature);
        if (selectedIdRef.current === selectedId) setMessages((current) => current.some((message) => message.id === result.message.id) ? current : [...current, result.message]);
      }
    } finally {
      setSending(false);
    }
  }, [organizationId, selectedId, sending]);

  useEffect(() => {
    const presence = outgoingTyping.current;
    return () => {
      if (presence.timer) clearTimeout(presence.timer);
      if (presence.active && organizationId && selectedId) socket.emit("internal:typing:stop", { organizationId, conversationId: selectedId });
      presence.active = false;
      presence.lastSentAt = 0;
      presence.timer = null;
    };
  }, [organizationId, selectedId]);

  const sendTyping = useCallback((active: boolean) => {
    if (!organizationId || !selectedId) return;
    const presence = outgoingTyping.current;
    if (presence.timer) clearTimeout(presence.timer);
    const stop = () => {
      if (presence.active) socket.emit("internal:typing:stop", { organizationId, conversationId: selectedId });
      presence.active = false;
      presence.timer = null;
    };
    if (!active) { stop(); return; }
    const now = Date.now();
    if (!presence.active || now - presence.lastSentAt >= 1_000) {
      socket.emit("internal:typing:start", { organizationId, conversationId: selectedId });
      presence.lastSentAt = now;
    }
    presence.active = true;
    presence.timer = setTimeout(stop, 1_800);
  }, [organizationId, selectedId]);

  const react = useCallback(async (messageId: number, emoji: string) => {
    if (!organizationId || !selectedId) return;
    const existing = messages.find((message) => message.id === messageId)?.reactions.find((reaction) => reaction.userId === currentUserIdRef.current);
    if (existing?.emoji === emoji) await internalChatApi.removeReaction(organizationId, selectedId, messageId);
    else await internalChatApi.react(organizationId, selectedId, messageId, emoji);
  }, [messages, organizationId, selectedId]);

  const deleteMessage = useCallback(async (messageId: number) => {
    if (!organizationId || !selectedId) return;
    await internalChatApi.deleteMessage(organizationId, selectedId, messageId);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, content: "", deletedAt: new Date().toISOString() } : message));
    setConversations((current) => current.map((conversation) => conversation.id === selectedId && conversation.lastMessage?.id === messageId ? { ...conversation, lastMessage: null } : conversation));
  }, [organizationId, selectedId]);

  const updateMessageFlags = useCallback(async (messageId: number, flags: { pinned?: boolean; pinDurationHours?: 24 | 168 | 720; favorited?: boolean }) => {
    if (!organizationId || !selectedId) return;
    const result = await internalChatApi.messageFlags(organizationId, selectedId, messageId, flags);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...result } : message));
  }, [organizationId, selectedId]);

  return { organizationId, conversations, members, selected, selectedId, messages, loading, loadingMessages, loadingOlderMessages, hasOlderMessages, sending, error, typingUserId, typingUserIds, reload, selectConversation, startDirect, startGroup, addParticipants, updatePreferences, updateAvatar, loadOlderMessages, sendMessage, sendMedia, sendTyping, react, deleteMessage, updateMessageFlags };
}
