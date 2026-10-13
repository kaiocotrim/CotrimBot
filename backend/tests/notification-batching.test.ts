import assert from "node:assert/strict";
import test, { mock } from "node:test";
import webpush from "web-push";

const users = Array.from({ length: 12 }, (_, index) => `user-${index}`);
const subscriptions = Array.from({ length: 13 }, (_, index) => ({
  id: index,
  endpoint: `https://push.example/${index}`,
  p256dh: "test-public-key",
  auth: "test-auth",
}));
const contact = { id: 7, name: "Contato", phone: "5511999999999", isGroup: false, isSaved: true };
const payload = { id: null, type: "NEW_MESSAGE", title: "Contato", body: "Olá", contactId: 7 };
const queriedUsers: string[] = [];
const createdUsers: string[] = [];
const emittedRooms: string[] = [];
const deleted: number[] = [];
const delivered: Array<{ endpoint: string; payload: string }> = [];
let active = 0;
let peak = 0;
let expireSubscriptions = false;
let failDelivery = false;
let failedUser: string | undefined;

mock.module("../src/lib/prisma.ts", {
  namedExports: {
    prisma: {
      pushSubscription: {
        findMany: async ({ where }: { where: { userId: string } }) => {
          queriedUsers.push(where.userId);
          return subscriptions;
        },
        deleteMany: async ({ where }: { where: { id: number } }) => {
          deleted.push(where.id);
        },
      },
      contactAssignment: {
        findMany: async () => users.map((userId) => ({ userId })),
      },
      notification: {
        create: async ({ data }: { data: { userId: string } }) => {
          createdUsers.push(data.userId);
          if (data.userId === failedUser) throw new Error("falha ao criar notificação");
          return { ...data, id: 1, contactId: contact.id };
        },
      },
    },
  },
});

mock.module("../src/lib/socket.ts", {
  namedExports: {
    getSocketServer: () => ({
      to: (room: string) => ({
        emit: () => { emittedRooms.push(room); },
      }),
    }),
  },
});

mock.method(webpush, "setVapidDetails", () => {});
mock.method(webpush, "sendNotification", async (subscription, body, options) => {
  active++;
  peak = Math.max(peak, active);
  await new Promise<void>((resolve) => setImmediate(resolve));
  active--;
  assert.equal(options?.TTL, 60 * 60 * 24);
  assert.equal(options?.timeout, 10000);
  if (failDelivery && subscription.endpoint.endsWith("/0")) {
    throw new Error("push delivery timeout");
  }
  if (expireSubscriptions && (subscription.endpoint.endsWith("/0") || subscription.endpoint.endsWith("/1"))) {
    throw new webpush.WebPushError("expired", subscription.endpoint.endsWith("/0") ? 404 : 410, {}, "", subscription.endpoint);
  }
  delivered.push({ endpoint: subscription.endpoint, payload: String(body) });
  return { statusCode: 201, headers: {}, body: "" };
});

const previousPublicKey = process.env.VAPID_PUBLIC_KEY;
const previousPrivateKey = process.env.VAPID_PRIVATE_KEY;
process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";
const { sendPushToUser } = await import("../src/services/push.service.js");
const { notifyAssignment, notifyIncomingMessage } = await import("../src/services/notification.service.js");
if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
else process.env.VAPID_PUBLIC_KEY = previousPublicKey;
if (previousPrivateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
else process.env.VAPID_PRIVATE_KEY = previousPrivateKey;

function reset() {
  queriedUsers.length = 0;
  createdUsers.length = 0;
  emittedRooms.length = 0;
  deleted.length = 0;
  delivered.length = 0;
  active = 0;
  peak = 0;
  expireSubscriptions = false;
  failDelivery = false;
  failedUser = undefined;
}

async function waitForDeliveries(count: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (delivered.length === count && active === 0) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail(`entregas esperadas: ${count}; recebidas: ${delivered.length}`);
}

test("push entrega a todas as subscriptions em lotes de cinco e remove apenas as expiradas", async () => {
  reset();
  expireSubscriptions = true;
  await sendPushToUser("user-0", payload);

  assert.equal(peak, 5);
  assert.deepEqual(deleted, [0, 1]);
  assert.deepEqual(delivered.map(({ endpoint }) => endpoint), subscriptions.slice(2).map(({ endpoint }) => endpoint));
  assert.ok(delivered.every((delivery) => delivery.payload === JSON.stringify(payload)));
});

test("mensagem recebida limita também a concorrência dos lotes aninhados de push", async () => {
  reset();
  assert.equal(notifyIncomingMessage(contact, { content: "Olá", type: "TEXT" }), undefined);
  await waitForDeliveries(users.length * subscriptions.length);

  assert.equal(peak, 5);
  assert.deepEqual(queriedUsers, users);
  assert.equal(createdUsers.length, 0);
  assert.ok(delivered.every((delivery) => delivery.payload === JSON.stringify(payload)));
});

test("falha de entrega push não impede subscriptions nem destinatários seguintes", async (t) => {
  reset();
  failDelivery = true;
  const logged = t.mock.method(console, "error", () => {});
  notifyIncomingMessage(contact, { content: "Olá", type: "TEXT" });
  await waitForDeliveries(users.length * (subscriptions.length - 1));

  assert.equal(peak, 5);
  assert.deepEqual(queriedUsers, users);
  assert.equal(deleted.length, 0);
  assert.equal(logged.mock.callCount(), users.length);
});

test("atribuição ignora o autor e aguarda cada entrega antes de iniciar o próximo usuário", async () => {
  reset();
  assert.equal(notifyAssignment(contact, users, { id: users[0]!, name: "Autor" }), undefined);
  await waitForDeliveries((users.length - 1) * subscriptions.length);

  assert.equal(peak, 5);
  assert.deepEqual(createdUsers, users.slice(1));
  assert.deepEqual(queriedUsers, users.slice(1));
  assert.deepEqual(emittedRooms, users.slice(1).map((userId) => `user:${userId}`));
});

test("falha em uma atribuição não impede as notificações dos próximos usuários", async (t) => {
  reset();
  failedUser = users[1];
  const logged = t.mock.method(console, "error", () => {});
  notifyAssignment(contact, users, { id: users[0]!, name: "Autor" });
  await waitForDeliveries((users.length - 2) * subscriptions.length);

  assert.equal(peak, 5);
  assert.deepEqual(createdUsers, users.slice(1));
  assert.deepEqual(queriedUsers, users.slice(2));
  assert.equal(logged.mock.callCount(), 1);
});
