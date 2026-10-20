import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { createContactTypingPresence } from "../src/services/contact-typing.service.js";

test("contact typing isolates viewers, trusts session identity, handles multiple tabs, disconnects, expiry and cancelled joins", async () => {
  const http = createServer();
  const io = new Server(http);
  let releaseLookup: ((exists: boolean) => void) | undefined;
  const register = createContactTypingPresence(io, async id => id === 99
    ? new Promise<boolean>(resolve => { releaseLookup = resolve; })
    : id === 1 || id === 2);
  io.use((socket, next) => {
    const id = socket.handshake.auth.userId;
    if (["viewer", "alice", "bob", "other", "race"].includes(id)) {
      socket.data.userId = id;
      socket.data.userName = id === "alice" ? "Alice" : id === "bob" ? "Bruno" : id;
      socket.data.userImage = id === "alice" ? "https://example.com/alice.png" : null;
    }
    next();
  });
  io.on("connection", register);
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address() as { port: number };
  const sockets: Socket[] = [];
  const snapshots = new Map<Socket, Array<{ contactId: number; members: Array<{ userId: string; name: string; image: string | null }> }>>();
  async function client(userId: string) {
    const socket = connect(`http://127.0.0.1:${address.port}`, { auth: { userId }, transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    snapshots.set(socket, []);
    socket.on("contact:typing", value => snapshots.get(socket)!.push(value));
    await new Promise<void>(resolve => socket.on("connect", resolve));
    return socket;
  }
  async function until(predicate: () => boolean, timeout = 2000) {
    const end = Date.now() + timeout;
    while (!predicate() && Date.now() < end) await delay(10);
    assert(predicate(), "Expected contact typing state was not received");
  }
  const users = (socket: Socket) => snapshots.get(socket)!.at(-1)?.members.map(member => member.userId).sort() ?? [];
  const view = (socket: Socket, contactId: unknown) => socket.timeout(2000).emitWithAck("contact:view", { contactId });
  try {
    const viewer = await client("viewer"), alice = await client("alice"), aliceTab = await client("alice"), bob = await client("bob"), other = await client("other"), guest = await client("guest");
    assert.equal(await view(viewer, 1), true);
    assert.equal(await view(alice, 1), true);
    assert.equal(await view(aliceTab, 1), true);
    assert.equal(await view(bob, 1), true);
    assert.equal(await view(other, 2), true);
    assert.equal(await view(guest, 1), false);
    assert.equal(await view(other, "1"), false);
    assert.equal(await view(other, -1), false);
    assert.equal(await view(other, 1234), false);
    guest.emit("contact:typing:start", { contactId: 1 });
    alice.emit("contact:typing:start", { contactId: 1, userId: "fake", name: "Impersonation", image: "https://example.com/spoof.png" });
    await until(() => users(viewer).join() === "alice");
    assert.equal(snapshots.get(viewer)!.at(-1)!.members[0]!.name, "Alice");
    assert.equal(snapshots.get(viewer)!.at(-1)!.members[0]!.image, "https://example.com/alice.png");
    assert.deepEqual(users(other), []);
    assert.equal(snapshots.get(guest)!.length, 0);
    const watcher = await client("race");
    assert.equal(await view(watcher, 2), true);
    let initialSidebar: { contacts: Array<{ contactId: number; members: Array<{ userId: string }> }> } | undefined;
    watcher.on("contact:typing:snapshot", value => { initialSidebar = value; });
    let guestSnapshots = 0;
    guest.on("contact:typing:snapshot", () => { guestSnapshots += 1; });
    guest.emit("contact:typing:watch");
    watcher.emit("contact:typing:watch");
    await until(() => Boolean(initialSidebar));
    assert.equal(initialSidebar!.contacts[0]!.contactId, 1);
    assert.equal(initialSidebar!.contacts[0]!.members[0]!.userId, "alice");
    assert.equal(guestSnapshots, 0);
    watcher.emit("contact:typing:start", { contactId: 1 });
    await delay(30);
    assert.deepEqual(users(viewer), ["alice"]);
    bob.emit("contact:typing:start", { contactId: 1 });
    aliceTab.emit("contact:typing:start", { contactId: 1 });
    await until(() => users(viewer).join() === "alice,bob");
    await until(() => users(watcher).join() === "alice,bob");
    watcher.emit("contact:typing:unwatch");
    await until(() => !io.sockets.sockets.get(watcher.id!)?.rooms.has("contact:typing:watchers"));
    const watcherEvents = snapshots.get(watcher)!.length;
    alice.emit("contact:typing:stop", { contactId: 1 });
    await delay(40);
    assert.deepEqual(users(viewer), ["alice", "bob"]);
    aliceTab.disconnect();
    await until(() => users(viewer).join() === "bob");
    assert.equal(snapshots.get(watcher)!.length, watcherEvents);
    assert.equal(await view(bob, 2), true);
    await until(() => users(viewer).length === 0);
    bob.emit("contact:typing:start", { contactId: 2 });
    await until(() => users(other).join() === "bob");
    assert.deepEqual(users(viewer), []);
    await until(() => users(other).length === 0, 5000);

    const race = await client("race");
    const pending = view(race, 99);
    await until(() => Boolean(releaseLookup));
    race.emit("contact:leave", { contactId: 99 });
    await delay(30);
    releaseLookup!(true);
    assert.equal(await pending, false);
    assert.equal(io.sockets.sockets.get(race.id!)?.rooms.has("contact:typing:99"), false);
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await new Promise<void>(resolve => io.close(() => resolve()));
  }
});
