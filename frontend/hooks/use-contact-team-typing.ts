"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";

export type TeamTypingMember = { userId: string; name: string; image?: string | null };
type TypingSnapshot = { contactId: number; members: TeamTypingMember[] };

export function useContactTeamTyping(contactId: number | undefined, userId: string) {
  const [snapshot, setSnapshot] = useState<TypingSnapshot | null>(null);
  const activity = useRef<((active: boolean) => void) | null>(null);

  useEffect(() => {
    if (!contactId || !userId) return;
    let alive = true;
    let joined = false;
    let intent = false;
    let active = false;
    let lastSentAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    function stop() {
      clearTimeout(idleTimer);
      intent = false;
      if (active && joined && socket.connected) socket.emit("contact:typing:stop", { contactId });
      active = false;
      lastSentAt = 0;
    }
    function send(activeIntent: boolean) {
      if (!activeIntent) { stop(); return; }
      intent = true;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(stop, 1800);
      if (!joined || !socket.connected) return;
      const now = Date.now();
      if (!active || now - lastSentAt >= 1000) {
        socket.emit("contact:typing:start", { contactId });
        lastSentAt = now;
      }
      active = true;
    }
    function join() {
      joined = false;
      socket.emit("contact:view", { contactId }, (accepted: boolean) => {
        if (!alive) return;
        joined = accepted === true;
        if (joined && intent) send(true);
      });
    }
    function receive(payload: TypingSnapshot) {
      if (payload?.contactId !== contactId || !Array.isArray(payload.members)) return;
      const members = payload.members.filter((member) => member && typeof member.userId === "string" && member.userId !== userId && typeof member.name === "string")
        .map((member) => ({ userId: member.userId, name: member.name, image: typeof member.image === "string" ? member.image : null }));
      clearTimeout(expiryTimer);
      setSnapshot({ contactId: payload.contactId, members });
      expiryTimer = setTimeout(() => setSnapshot(null), 4500);
    }
    function disconnect() {
      joined = false;
      stop();
      clearTimeout(expiryTimer);
      setSnapshot(null);
    }
    function visibilityChanged() { if (document.hidden) stop(); }
    activity.current = send;
    socket.on("connect", join);
    socket.on("disconnect", disconnect);
    socket.on("contact:typing", receive);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibilityChanged);
    if (socket.connected) join();
    return () => {
      alive = false;
      stop();
      clearTimeout(expiryTimer);
      activity.current = null;
      if (socket.connected) socket.emit("contact:leave", { contactId });
      socket.off("connect", join);
      socket.off("disconnect", disconnect);
      socket.off("contact:typing", receive);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [contactId, userId]);

  const sendTyping = useCallback((active: boolean) => activity.current?.(active), []);
  const typingMembers = snapshot && snapshot.contactId === contactId ? snapshot.members : [];
  const names = typingMembers.map((member) => member.name);
  const typingLabel = names.length === 0 ? undefined
    : names.length === 1 ? `${names[0]} está digitando…`
    : names.length === 2 ? `${names[0]} e ${names[1]} estão digitando…`
    : `${names[0]} e mais ${names.length - 1} membros estão digitando…`;
  return { typingLabel, typingMembers, sendTyping };
}
