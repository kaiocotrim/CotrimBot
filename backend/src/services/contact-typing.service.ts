import type { Server, Socket } from "socket.io";

type TypingMember = { userId: string; name: string; image: string | null };
type TypingSession = TypingMember & { timer: ReturnType<typeof setTimeout> };
const TYPING_TTL_MS = 4000;
const room = (contactId: number) => `contact:typing:${contactId}`;
const WATCHERS_ROOM = "contact:typing:watchers";

// External contacts are shared by authenticated users. Keep transient activity
// scoped to sockets actually viewing that contact, never a global broadcast.
export function createContactTypingPresence(io: Server, contactExists: (id: number) => Promise<boolean>) {
  const typing = new Map<number, Map<string, TypingSession>>();

  function members(contactId: number) {
    return [...new Map([...(typing.get(contactId)?.values() ?? [])].map(({ userId, name, image }) => [userId, { userId, name, image }])).values()];
  }
  function broadcast(contactId: number) {
    io.to([room(contactId), WATCHERS_ROOM]).emit("contact:typing", { contactId, members: members(contactId) });
  }
  function remove(contactId: number, socketId: string) {
    const sessions = typing.get(contactId);
    const session = sessions?.get(socketId);
    if (!session) return;
    clearTimeout(session.timer);
    sessions!.delete(socketId);
    if (!sessions!.size) typing.delete(contactId);
    broadcast(contactId);
  }

  return function register(socket: Socket) {
    let selected: number | null = null;
    let requested: number | null = null;
    let revision = 0;
    let watching = false;
    const userId = typeof socket.data.userId === "string" ? socket.data.userId : null;
    const name = typeof socket.data.userName === "string" && socket.data.userName.trim() ? socket.data.userName.trim() : "Membro da equipe";
    const image = typeof socket.data.userImage === "string" ? socket.data.userImage : null;

    // The sidebar observes all shared contacts without changing the contact
    // this socket is viewing or allowing it to publish typing in other chats.
    socket.on("contact:typing:watch", async () => {
      if (!userId) return;
      watching = true;
      await socket.join(WATCHERS_ROOM);
      if (!watching || !socket.connected) { void socket.leave(WATCHERS_ROOM); return; }
      socket.emit("contact:typing:snapshot", { contacts: [...typing.keys()].map(contactId => ({ contactId, members: members(contactId) })) });
    });
    socket.on("contact:typing:unwatch", () => {
      watching = false;
      void socket.leave(WATCHERS_ROOM);
    });

    function leave() {
      if (selected === null) return;
      remove(selected, socket.id);
      void socket.leave(room(selected));
      selected = null;
    }
    function payloadContact(payload: unknown) {
      if (!payload || typeof payload !== "object") return null;
      const id = (payload as { contactId?: unknown }).contactId;
      return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
    }

    socket.on("contact:view", async (payload: unknown, acknowledge?: (joined: boolean) => void) => {
      const id = payloadContact(payload);
      const version = ++revision;
      requested = id;
      const ack = (joined: boolean) => { if (typeof acknowledge === "function") acknowledge(joined); };
      if (!userId || id === null) { ack(false); return; }
      try {
        const exists = await contactExists(id);
        if (version !== revision || !socket.connected) { ack(false); return; }
        if (!exists) { ack(false); return; }
        leave();
        selected = id;
        await socket.join(room(id));
        if (version !== revision || !socket.connected) { ack(false); return; }
        socket.emit("contact:typing", { contactId: id, members: members(id) });
        ack(true);
      } catch {
        ack(false);
      }
    });
    socket.on("contact:leave", (payload: unknown) => {
      const id = payloadContact(payload);
      if (id === null) return;
      if (id === requested) { revision += 1; requested = null; }
      if (id === selected) leave();
    });
    socket.on("contact:typing:start", (payload: unknown) => {
      if (!userId || selected === null || payloadContact(payload) !== selected) return;
      const id = selected;
      const sessions = typing.get(id) ?? new Map<string, TypingSession>();
      const existing = sessions.get(socket.id);
      if (existing) clearTimeout(existing.timer);
      sessions.set(socket.id, { userId, name, image, timer: setTimeout(() => remove(id, socket.id), TYPING_TTL_MS) });
      typing.set(id, sessions);
      broadcast(id);
    });
    socket.on("contact:typing:stop", (payload: unknown) => {
      if (selected !== null && payloadContact(payload) === selected) remove(selected, socket.id);
    });
    socket.on("disconnect", () => { watching = false; revision += 1; leave(); });
  };
}
