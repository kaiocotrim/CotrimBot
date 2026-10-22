import assert from "node:assert/strict";
import test from "node:test";
import { authenticateApiToken, createApiToken, hashApiToken } from "../src/services/api-token.js";

function userRecord(input: { banned?: boolean | null; banExpires?: Date | null } = {}) {
  return {
    id: "user-1",
    name: "Usuário",
    email: "user@example.test",
    emailVerified: true,
    banned: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...input,
  };
}

test("creates unique opaque API tokens and stores only a stable SHA-256 hash", () => {
  const first = createApiToken();
  const second = createApiToken();

  assert.match(first.token, /^cbt_[A-Za-z0-9_-]{43}$/);
  assert.equal(first.tokenPrefix, first.token.slice(0, 12));
  assert.equal(first.tokenHash, hashApiToken(first.token));
  assert.notEqual(first.token, first.tokenHash);
  assert.notEqual(first.token, second.token);
  assert.equal(hashApiToken("invalid"), null);
  assert.equal(hashApiToken("cbt_invalid/"), null);
});

test("authenticates valid, non-revoked API tokens and updates last use", async () => {
  const created = createApiToken();
  const user = userRecord({ banned: false });
  let lookup: unknown;
  let useUpdate: unknown;
  const database = {
    apiToken: {
      findFirst: async (args: unknown) => {
        lookup = args;
        return { id: "token-1", user };
      },
      updateMany: async (args: unknown) => {
        useUpdate = args;
        return { count: 1 };
      },
    },
  };

  assert.equal(await authenticateApiToken(["Bearer ", created.token].join(""), database), user);
  assert.deepEqual(lookup, {
    where: { tokenHash: created.tokenHash, revokedAt: null },
    include: { user: true },
  });
  assert.deepEqual((useUpdate as { where: object }).where, { id: "token-1", revokedAt: null });
  assert.ok((useUpdate as { data: { lastUsedAt: Date } }).data.lastUsedAt instanceof Date);
});

test("rejects missing, malformed, revoked, and banned API tokens", async () => {
  const created = createApiToken();
  let databaseCalls = 0;
  const database = {
    apiToken: {
      findFirst: async () => {
        databaseCalls += 1;
        return null;
      },
      updateMany: async () => ({ count: 1 }),
    },
  };

  assert.equal(await authenticateApiToken(undefined, database), null);
  assert.equal(await authenticateApiToken("Basic value", database), null);
  assert.equal(await authenticateApiToken("Not a token", database), null);
  assert.equal(databaseCalls, 0);
  assert.equal(await authenticateApiToken(["Bearer ", created.token].join(""), database), null);

  const bannedDatabase = {
    apiToken: {
      findFirst: async () => ({ id: "token-1", user: userRecord({ banned: true, banExpires: null }) }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  assert.equal(await authenticateApiToken(["Bearer ", created.token].join(""), bannedDatabase), null);

  const revokedDuringAuthentication = {
    apiToken: {
      findFirst: async () => ({ id: "token-1", user: userRecord() }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  assert.equal(await authenticateApiToken(["Bearer ", created.token].join(""), revokedDuringAuthentication), null);
});
