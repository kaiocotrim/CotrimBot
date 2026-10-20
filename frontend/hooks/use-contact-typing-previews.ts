"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import type { TeamTypingMember } from "@/hooks/use-contact-team-typing";

type ContactTyping = { contactId: number; members: TeamTypingMember[] };
const EMPTY = new Map<number, TeamTypingMember[]>();

export function useContactTypingPreviews(userId: string) {
  const [snapshot, setSnapshot] = useState<{ userId: string; contacts: Map<number, TeamTypingMember[]> } | null>(null);

  useEffect(() => {
    if (!userId) return;
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    function clearTimers() { timers.forEach(clearTimeout); timers.clear(); }
    function otherMembers(members: TeamTypingMember[]) {
      return members.filter(member => member && typeof member.userId === "string" && member.userId !== userId && typeof member.name === "string");
    }
    function expire(contactId: number) {
      clearTimeout(timers.get(contactId));
      timers.set(contactId, setTimeout(() => {
        timers.delete(contactId);
        setSnapshot(current => {
          if (!current || current.userId !== userId) return current;
          const contacts = new Map(current.contacts);
          contacts.delete(contactId);
          return { userId, contacts };
        });
      }, 4500));
    }
    function receive(payload: ContactTyping) {
      if (!Number.isSafeInteger(payload?.contactId) || payload.contactId <= 0 || !Array.isArray(payload.members)) return;
      const members = otherMembers(payload.members);
      clearTimeout(timers.get(payload.contactId));
      timers.delete(payload.contactId);
      if (members.length) expire(payload.contactId);
      setSnapshot(current => {
        const contacts = new Map(current?.userId === userId ? current.contacts : []);
        if (members.length) contacts.set(payload.contactId, members);
        else contacts.delete(payload.contactId);
        return { userId, contacts };
      });
    }
    function receiveSnapshot(payload: { contacts: ContactTyping[] }) {
      if (!Array.isArray(payload?.contacts)) return;
      clearTimers();
      const contacts = new Map<number, TeamTypingMember[]>();
      for (const item of payload.contacts) {
        if (!Number.isSafeInteger(item?.contactId) || item.contactId <= 0 || !Array.isArray(item.members)) continue;
        const members = otherMembers(item.members);
        if (members.length) { contacts.set(item.contactId, members); expire(item.contactId); }
      }
      setSnapshot({ userId, contacts });
    }
    function subscribe() { socket.emit("contact:typing:watch"); }
    function disconnect() { clearTimers(); setSnapshot(null); }
    socket.on("contact:typing", receive);
    socket.on("contact:typing:snapshot", receiveSnapshot);
    socket.on("connect", subscribe);
    socket.on("disconnect", disconnect);
    if (socket.connected) subscribe();
    return () => {
      clearTimers();
      socket.off("contact:typing", receive);
      socket.off("contact:typing:snapshot", receiveSnapshot);
      socket.off("connect", subscribe);
      socket.off("disconnect", disconnect);
      if (socket.connected) socket.emit("contact:typing:unwatch");
    };
  }, [userId]);

  return snapshot && snapshot.userId === userId ? snapshot.contacts : EMPTY;
}
