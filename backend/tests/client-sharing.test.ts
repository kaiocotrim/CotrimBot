import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { createClientRouter } from "../src/routes/client-profile.routes.js";
import { getClientAccess } from "../src/services/client-access.service.js";

type StoredClient = {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  image: string | null;
  links: string[];
  createdAt: Date;
};

const memberships = [
  { userId: "kaio", organizationId: "empresa-a" },
  { userId: "bruno", organizationId: "empresa-a" },
  { userId: "carla", organizationId: "empresa-b" },
  { userId: "multi", organizationId: "empresa-a" },
  { userId: "multi", organizationId: "empresa-b" },
];

const lookup = async (userId: string, organizationId?: string) => memberships
  .filter((member) => member.userId === userId && (!organizationId || member.organizationId === organizationId))
  .map(({ organizationId: memberOrganizationId }) => ({ organizationId: memberOrganizationId }))
  .slice(0, 2);

// O mock precisa respeitar os filtros: devolver todos os registros esconderia vazamentos entre empresas.
function matchesWhere(record: Record<string, unknown>, value: unknown): boolean {
  if (value === undefined) return true;
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return Object.entries(value).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (key === "OR") {
      assert.ok(Array.isArray(expected));
      return expected.some((condition) => matchesWhere(record, condition));
    }
    if (key === "AND") {
      const conditions = Array.isArray(expected) ? expected : [expected];
      return conditions.every((condition) => matchesWhere(record, condition));
    }
    if (key === "NOT") {
      const conditions = Array.isArray(expected) ? expected : [expected];
      return conditions.every((condition) => !matchesWhere(record, condition));
    }
    assert.ok(["id", "userId", "organizationId"].includes(key), `Filtro não simulado: ${key}`);
    return record[key] === expected;
  });
}

function storedClient(id: string, userId: string, organizationId: string | null): StoredClient {
  return {
    id,
    userId,
    organizationId,
    name: `Cliente ${id}`,
    image: null,
    links: [],
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
  };
}

type Query = { where?: unknown; select?: Record<string, boolean>; take?: number };

function selectFields(record: Record<string, unknown>, select?: Record<string, boolean>) {
  if (!select) return { ...record };
  return Object.fromEntries(Object.entries(select).filter(([, included]) => included).map(([key]) => [key, record[key]]));
}

async function createHarness(context: TestContext, initialClients: StoredClient[] = []) {
  const clients = initialClients.map((client) => ({ ...client, links: [...client.links] }));
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const database = {
    member: {
      findMany: async ({ where, select, take }: Query) => memberships
        .filter((member) => matchesWhere(member, where))
        .slice(0, take)
        .map((member) => selectFields(member, select)),
    },
    client: {
      findMany: async ({ where, select }: Query) => clients
        .filter((client) => matchesWhere(client, where))
        .map((client) => selectFields(client, select)),
      findFirst: async ({ where, select }: Query) => {
        const client = clients.find((candidate) => matchesWhere(candidate, where));
        return client ? selectFields(client, select) : null;
      },
      create: async ({ data, select }: Query & { data: Omit<StoredClient, "id" | "createdAt"> }) => {
        const client = { ...data, id: `created-${clients.length + 1}`, createdAt: new Date() };
        clients.push(client);
        return selectFields(client, select);
      },
      update: async ({ where, data, select }: Query & { data: Partial<StoredClient> }) => {
        updates.push({ where, data: { ...data } });
        const client = clients.find((candidate) => matchesWhere(candidate, where));
        assert.ok(client, "A atualização deve localizar o cliente dentro do escopo autorizado.");
        Object.assign(client, data);
        return selectFields(client, select);
      },
      deleteMany: async ({ where }: Query) => {
        let count = 0;
        for (let index = clients.length - 1; index >= 0; index -= 1) {
          if (matchesWhere(clients[index]!, where)) {
            clients.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
  };

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    const userId = request.get("x-test-user");
    if (userId) request.user = { id: userId } as NonNullable<typeof request.user>;
    request.activeOrganizationId = request.get("x-test-organization");
    next();
  });
  app.use("/api", createClientRouter(database as unknown as Parameters<typeof createClientRouter>[0]));
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  async function request(
    method: string,
    path = "/clients",
    userId?: string,
    organizationId?: string,
    body?: Record<string, unknown>,
  ) {
    const headers: Record<string, string> = {};
    if (userId) headers["x-test-user"] = userId;
    if (organizationId) headers["x-test-organization"] = organizationId;
    if (body) headers["content-type"] = "application/json";
    return fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  return { clients, updates, request };
}

test("Kaio cadastra e Bruno lista e edita o mesmo cliente da equipe", async (context) => {
  const { clients, updates, request } = await createHarness(context);
  const creation = await request("POST", "/clients", "kaio", "empresa-a", {
    name: "Empresa do Kaio",
    image: "https://example.test/antes.png",
    links: ["https://example.test/antes"],
    userId: "carla",
    organizationId: "empresa-b",
  });
  assert.equal(creation.status, 201);
  const { client: created } = await creation.json() as { client: { id: string; canDelete: boolean; userId?: string } };
  assert.equal(created.canDelete, true);
  assert.equal(created.userId, undefined);
  assert.equal(clients[0]?.userId, "kaio", "A autoria vem da sessão, nunca do corpo.");
  assert.equal(clients[0]?.organizationId, "empresa-a");

  const listing = await request("GET", "/clients", "bruno", "empresa-a");
  assert.equal(listing.status, 200);
  const listed = await listing.json() as { clients: Array<{ id: string; canDelete: boolean; userId?: string }> };
  assert.deepEqual(listed.clients.map((client) => client.id), [created.id]);
  assert.equal(listed.clients[0]?.canDelete, true);
  assert.equal(listed.clients[0]?.userId, undefined);

  const change = {
    name: "Empresa atualizada pelo Bruno",
    image: "https://example.test/depois.png",
    links: ["https://example.test/depois", "https://example.test/contato"],
    userId: "bruno",
    organizationId: "empresa-b",
  };
  const editing = await request("PUT", `/clients/${created.id}`, "bruno", "empresa-a", change);
  assert.equal(editing.status, 200);
  const { client: edited } = await editing.json() as { client: Pick<StoredClient, "id" | "name" | "image" | "links"> & { canDelete: boolean } };
  assert.equal(edited.canDelete, true);
  assert.equal(edited.id, created.id);
  assert.equal(edited.name, change.name);
  assert.equal(edited.image, change.image);
  assert.deepEqual(edited.links, change.links);
  assert.equal(clients[0]?.userId, "kaio", "Editar não transfere a autoria.");
  assert.equal(clients[0]?.organizationId, "empresa-a", "Editar não transfere a empresa.");
  assert.equal(updates.length, 1);
  assert.ok(!matchesWhere({ ...clients[0]!, organizationId: "empresa-b" }, updates[0]?.where),
    "O update também precisa incluir o escopo, não apenas o findFirst anterior.");

  const reloaded = await request("GET", "/clients", "kaio", "empresa-a");
  const afterEdit = await reloaded.json() as { clients: Array<{ id: string; name: string; image: string; links: string[] }> };
  assert.equal(afterEdit.clients[0]?.id, created.id);
  assert.equal(afterEdit.clients[0]?.name, change.name);
  assert.equal(afterEdit.clients[0]?.image, change.image);
  assert.deepEqual(afterEdit.clients[0]?.links, change.links);
});

test("outra empresa não lista, edita nem exclui o cliente", async (context) => {
  const { clients, updates, request } = await createHarness(context, [storedClient("compartilhado", "kaio", "empresa-a")]);
  const listing = await request("GET", "/clients", "carla", "empresa-b");
  assert.equal(listing.status, 200);
  assert.deepEqual(await listing.json(), { clients: [] });
  const editing = await request("PUT", "/clients/compartilhado", "carla", "empresa-b", {
    name: "Tentativa fora da empresa", image: null, links: [],
  });
  assert.equal(editing.status, 404);
  assert.equal((await request("DELETE", "/clients/compartilhado", "carla", "empresa-b")).status, 404);
  assert.equal(clients[0]?.name, "Cliente compartilhado");
  assert.equal(updates.length, 0);
});

test("qualquer membro da empresa pode excluir o cliente", async (context) => {
  const { clients, request } = await createHarness(context, [storedClient("do-kaio", "kaio", "empresa-a")]);
  assert.equal((await request("DELETE", "/clients/do-kaio", "bruno", "empresa-a")).status, 204);
  assert.equal(clients.length, 0);
});

test("empresa ativa sem vínculo é recusada, inclusive se a sessão estiver desatualizada", async (context) => {
  const { clients, request } = await createHarness(context, [storedClient("do-kaio", "kaio", "empresa-a")]);
  const body = { name: "Tentativa", image: null, links: [] };
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const path = method === "PUT" || method === "DELETE" ? "/clients/do-kaio" : "/clients";
    const response = await request(method, path, "bruno", "empresa-antiga", method === "POST" || method === "PUT" ? body : undefined);
    assert.equal(response.status, 403, method);
  }
  assert.equal(clients.length, 1);
});

test("usuário de múltiplas empresas precisa selecionar a empresa ativa", async (context) => {
  const { request } = await createHarness(context, [
    storedClient("a", "kaio", "empresa-a"),
    storedClient("b", "carla", "empresa-b"),
  ]);
  const ambiguous = await request("GET", "/clients", "multi");
  assert.equal(ambiguous.status, 409);
  const selected = await request("GET", "/clients", "multi", "empresa-b");
  assert.equal(selected.status, 200);
  const { clients } = await selected.json() as { clients: Array<{ id: string }> };
  assert.deepEqual(clients.map((client) => client.id), ["b"]);
});

test("membro de uma única empresa usa esse escopo mesmo sem empresa ativa na sessão", async (context) => {
  const { clients, request } = await createHarness(context, [storedClient("a", "kaio", "empresa-a")]);
  const listing = await request("GET", "/clients", "bruno");
  assert.equal(listing.status, 200);
  const listed = await listing.json() as { clients: Array<{ id: string }> };
  assert.deepEqual(listed.clients.map((client) => client.id), ["a"]);
  const creation = await request("POST", "/clients", "bruno", undefined, { name: "Novo", image: null, links: [] });
  assert.equal(creation.status, 201);
  assert.equal(clients[1]?.organizationId, "empresa-a");
  assert.equal(clients[1]?.userId, "bruno");
});

test("sem sessão nenhuma operação de clientes fica acessível", async (context) => {
  const { clients, request } = await createHarness(context, [storedClient("a", "kaio", "empresa-a")]);
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const path = method === "PUT" || method === "DELETE" ? "/clients/a" : "/clients";
    const response = await request(method, path, undefined, undefined,
      method === "POST" || method === "PUT" ? { name: "Sem sessão", image: null, links: [] } : undefined);
    assert.equal(response.status, 401, method);
  }
  assert.equal(clients.length, 1);
});

test("cadastros legados pessoais não expõem os clientes privados de outro membro", async (context) => {
  const { request } = await createHarness(context, [
    storedClient("legado-kaio", "kaio", null),
    storedClient("legado-bruno", "bruno", null),
    storedClient("equipe", "kaio", "empresa-a"),
  ]);
  const listing = await request("GET", "/clients", "bruno", "empresa-a");
  const { clients } = await listing.json() as { clients: Array<{ id: string }> };
  assert.equal(listing.status, 200);
  assert.deepEqual(clients.map((client) => client.id).sort(), ["equipe", "legado-bruno"]);
  assert.equal((await request("PUT", "/clients/legado-kaio", "bruno", "empresa-a", {
    name: "Não permitido", image: null, links: [],
  })).status, 404);
  assert.equal((await request("PUT", "/clients/legado-bruno", "bruno", "empresa-a", {
    name: "Meu cadastro antigo", image: null, links: [],
  })).status, 200);
});

test("usuário sem equipe mantém somente seus cadastros pessoais", async (context) => {
  const { clients, request } = await createHarness(context, [
    storedClient("pessoal", "sem-equipe", null),
    storedClient("de-outro", "kaio", null),
    storedClient("da-equipe", "kaio", "empresa-a"),
  ]);
  const listing = await request("GET", "/clients", "sem-equipe");
  const listed = await listing.json() as { clients: Array<{ id: string }> };
  assert.equal(listing.status, 200);
  assert.deepEqual(listed.clients.map((client) => client.id), ["pessoal"]);
  const creation = await request("POST", "/clients", "sem-equipe", undefined, {
    name: "Pessoal novo", image: null, links: [], organizationId: "empresa-a", userId: "kaio",
  });
  assert.equal(creation.status, 201);
  assert.equal(clients[3]?.userId, "sem-equipe");
  assert.equal(clients[3]?.organizationId, null);
});

test("resolvedor de acesso consulta somente as associações da sessão e nunca adivinha entre equipes", async () => {
  const shared = await getClientAccess("bruno", undefined, lookup);
  assert.equal(shared.organizationId, "empresa-a");
  assert.ok(matchesWhere(storedClient("a", "kaio", "empresa-a"), shared.where));
  assert.ok(!matchesWhere(storedClient("b", "carla", "empresa-b"), shared.where));
  assert.ok(!matchesWhere(storedClient("legado-kaio", "kaio", null), shared.where));
  assert.ok(matchesWhere(storedClient("legado-bruno", "bruno", null), shared.where));

  const personal = await getClientAccess("sem-equipe", undefined, lookup);
  assert.equal(personal.organizationId, null);
  assert.ok(matchesWhere(storedClient("meu", "sem-equipe", null), personal.where));
  assert.ok(!matchesWhere(storedClient("outro", "kaio", null), personal.where));
  await assert.rejects(getClientAccess("multi", undefined, lookup));
  await assert.rejects(getClientAccess("bruno", "empresa-antiga", lookup));
});
