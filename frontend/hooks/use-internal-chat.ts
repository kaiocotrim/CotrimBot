"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { socket } from "@/lib/socket";
import { internalChatApi, type InternalConversation, type InternalMember, type InternalMessage } from "@/lib/internal-chat-api";

export function useInternalChat() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<InternalConversation[]>([]);
  const [members, setMembers] = useState<InternalMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserId = useRef<string | null>(null);

  const selected = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? null, [conversations, selectedId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const organizations = (await authClient.organization.list()).data as Array<{ id: string }> | null;
      const organization = organizations?.[0];
      if (!organization) {
        setOrganizationId(null);
        setConversations([]);
        setMembers([]);
        return;
      }
      setOrganizationId(organization.id);
      const [conversationResult, memberResult] = await Promise.all([
        internalChatApi.list(organization.id),
        internalChatApi.members(organization.id),
      ]);
      setConversations(conversationResult.conversations);
      setMembers(memberResult.members);
      setSelectedId((current) => current ?? conversationResult.conversations[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o chat interno.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [reload]);

  useEffect(() => {
    const session = authClient.getSession();
    void session.then(({ data }) => { currentUserId.current = data?.user.id ?? null; });
  }, []);

  useEffect(() => {
    if (!organizationId || !selectedId) {
      queueMicrotask(() => setMessages([]));
      return;
    }
    let active = true;
    queueMicrotask(() => { if (active) setLoadingMessages(true); });
    void internalChatApi.messages(organizationId, selectedId)
      .then((result) => { if (active) setMessages(result.messages); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as mensagens."); })
      .finally(() => { if (active) setLoadingMessages(false); });
    void internalChatApi.read(organizationId, selectedId).catch(() => undefined);
    return () => { active = false; };
  }, [organizationId, selectedId]);

  useEffect(() => {
    if (!organizationId) return;
    const addMessage = (payload: { organizationId: string; conversationId: string; message: InternalMessage }) => {
      if (payload.organizationId !== organizationId) return;
      setConversations((current) => current.map((conversation) => conversation.id === payload.conversationId
        ? { ...conversation, updatedAt: payload.message.createdAt, lastMessage: payload.message, unreadCount: conversation.id === selectedId ? 0 : (conversation.unreadCount ?? 0) + (payload.message.senderId === currentUserId.current ? 0 : 1) }
        : conversation));
      if (payload.conversationId !== selectedId) return;
      setMessages((current) => current.some((message) => message.id === payload.message.id || (message.clientId && message.clientId === payload.message.clientId)) ? current : [...current, payload.message]);
      void internalChatApi.read(organizationId, selectedId).catch(() => undefined);
    };
    const handleDeleted = (payload: { conversationId: string; messageId: number }) => {
      if (payload.conversationId === selectedId) setMessages((current) => current.filter((message) => message.id !== payload.messageId));
    };
    const handleTyping = (payload: { organizationId: string; conversationId: string; userId: string }) => {
      if (payload.organizationId !== organizationId || payload.conversationId !== selectedId || payload.userId === currentUserId.current) return;
      setTypingUserId(payload.userId);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingUserId(null), 3_000);
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
    socket.on("internal:message:new", addMessage);
    socket.on("internal:message:deleted", handleDeleted);
    socket.on("internal:typing:start", handleTyping);
    socket.on("internal:typing:stop", () => setTypingUserId(null));
    socket.on("internal:reaction:updated", handleReaction);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("internal:message:new", addMessage);
      socket.off("internal:message:deleted", handleDeleted);
      socket.off("internal:typing:start", handleTyping);
      socket.off("internal:typing:stop");
      socket.off("internal:reaction:updated", handleReaction);
    };
  }, [organizationId, selectedId]);

  const selectConversation = useCallback((conversationId: string) => {
    setSelectedId(conversationId);
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation));
  }, []);

  const startDirect = useCallback(async (userId: string) => {
    if (!organizationId) return;
    const result = await internalChatApi.create(organizationId, { type: "DIRECT", participantIds: [userId] });
    setConversations((current) => current.some((conversation) => conversation.id === result.conversation.id) ? current : [result.conversation, ...current]);
    setSelectedId(result.conversation.id);
  }, [organizationId]);

  const sendMessage = useCallback(async (content: string, replyToMessageId?: number) => {
    if (!organizationId || !selectedId || !content.trim() || sending) return;
    const clientId = crypto.randomUUID();
    setSending(true);
    try {
      const result = await internalChatApi.send(organizationId, selectedId, { content: content.trim(), clientId, ...(replyToMessageId ? { replyToMessageId } : {}) });
      setMessages((current) => current.some((message) => message.id === result.message.id || message.clientId === clientId) ? current : [...current, result.message]);
    } finally {
      setSending(false);
    }
  }, [organizationId, selectedId, sending]);

  const sendTyping = useCallback((active: boolean) => {
    if (!organizationId || !selectedId) return;
    socket.emit(active ? "internal:typing:start" : "internal:typing:stop", { organizationId, conversationId: selectedId });
  }, [organizationId, selectedId]);

  const react = useCallback(async (messageId: number, emoji: string) => {
    if (!organizationId || !selectedId) return;
    const existing = messages.find((message) => message.id === messageId)?.reactions.find((reaction) => reaction.userId === currentUserId.current);
    if (existing?.emoji === emoji) await internalChatApi.removeReaction(organizationId, selectedId, messageId);
    else await internalChatApi.react(organizationId, selectedId, messageId, emoji);
  }, [messages, organizationId, selectedId]);

  return { organizationId, conversations, members, selected, selectedId, messages, loading, loadingMessages, sending, error, typingUserId, reload, selectConversation, startDirect, sendMessage, sendTyping, react };
}
