import { expect, test, type Page } from "@playwright/test";

async function openClientSettings(page: Page, omitDeletePermission = false) {
  let clients = [
    { id: "own-client", name: "Empresa teste", image: null, links: [], canDelete: true },
    { id: "shared-client", name: "Empresa compartilhada", image: null, links: [], canDelete: false },
  ];
  const deletes: string[] = [];
  const errors: string[] = [];
  const control = { failDeletion: false, beforeDelete: async () => {} };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.includes("/clients/") && request.method() === "DELETE") {
      deletes.push(path);
      await control.beforeDelete();
      if (control.failDeletion) {
        await route.fulfill({ status: 500, json: { error: "Não foi possível excluir o cliente." } });
      } else {
        const deletedId = path.split("/").pop();
        clients = clients.filter((client) => client.id !== deletedId);
        await route.fulfill({ status: 204 });
      }
      return;
    }
    let body: unknown = {};
    if (path.endsWith("/auth/get-session")) {
      body = {
        user: { id: "kaio", name: "Kaio teste", email: "kaio@example.invalid", emailVerified: true, role: "user", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        session: { id: "test-session", userId: "kaio", token: "test-only", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      };
    } else if (path.endsWith("/clients")) {
      body = { clients: omitDeletePermission
        ? clients.map((client) => ({ id: client.id, name: client.name, image: client.image, links: client.links }))
        : clients };
    } else if (path.endsWith("/contacts") || path.endsWith("/organization/list") || path.endsWith("/contacts/assignees")) {
      body = [];
    } else if (path.endsWith("/notifications")) {
      body = { notifications: [], unreadCount: 0 };
    }
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir configurações de Kaio teste" }).click();
  await page.getByRole("tab", { name: "Cliente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver e editar informações de Empresa teste", exact: true })).toBeVisible();
  return { deletes, errors, control };
}

for (const width of [1280, 390]) {
  test(`excluir cliente pede confirmação e atualiza a lista (${width}px)`, async ({ page }, testInfo) => {
    const { deletes, errors } = await openClientSettings(page);
    await page.getByRole("button", { name: "Ver e editar informações de Empresa teste", exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    const deleteButton = page.getByRole("button", { name: "Excluir cliente", exact: true });
    const form = page.locator("form").filter({ has: page.getByRole("textbox", { name: "Nome da empresa", exact: true }) });
    await expect(form.getByRole("button", { name: "Excluir cliente", exact: true })).toBeVisible();
    await expect(deleteButton).toBeVisible();
    await deleteButton.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("delete-client.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("Empresa teste");
      expect(dialog.message()).toContain("toda a equipe");
      await dialog.dismiss();
    });
    await deleteButton.click();
    await expect(page.getByRole("textbox", { name: "Nome da empresa", exact: true })).toHaveValue("Empresa teste");
    expect(deletes).toHaveLength(0);

    page.once("dialog", (dialog) => dialog.accept());
    await deleteButton.click();
    await expect(page.getByRole("status")).toContainText("Cliente excluído com sucesso.");
    await expect(page.getByRole("button", { name: "Ver e editar informações de Empresa teste", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ver e editar informações de Empresa compartilhada", exact: true })).toBeVisible();
    expect(deletes).toEqual(["/api/clients/own-client"]);
    expect(errors).toEqual([]);
  });
}

test("erro de exclusão mantém o cadastro e bloqueia ações enquanto aguarda", async ({ page }) => {
  const { deletes, control, errors } = await openClientSettings(page);
  await page.getByRole("button", { name: "Ver e editar informações de Empresa teste", exact: true }).click();
  control.failDeletion = true;
  let release!: () => void;
  control.beforeDelete = () => new Promise<void>((resolve) => { release = resolve; });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Excluir cliente", exact: true }).click();
  await expect.poll(() => deletes.length).toBe(1);
  await expect(page.getByRole("button", { name: "Excluindo…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Salvar alterações", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Não foi possível excluir o cliente.");
  await expect(page.getByRole("textbox", { name: "Nome da empresa", exact: true })).toHaveValue("Empresa teste");
  await expect(page.getByRole("button", { name: "Excluir cliente", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("qualquer membro pode excluir um cliente compartilhado", async ({ page }) => {
  const { deletes, errors } = await openClientSettings(page);
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Excluir cliente", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Ver e editar informações de Empresa compartilhada", exact: true }).click();
  const form = page.locator("form").filter({ has: page.getByRole("textbox", { name: "Nome da empresa", exact: true }) });
  await expect(form.getByRole("button", { name: "Excluir cliente", exact: true })).toBeVisible();
  await expect(form.getByRole("button", { name: "Excluir cliente", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Salvar alterações", exact: true })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await form.getByRole("button", { name: "Excluir cliente", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cliente excluído com sucesso.");
  expect(deletes).toEqual(["/api/clients/shared-client"]);
  expect(errors).toEqual([]);
});

test("resposta da API sem canDelete não esconde a opção de excluir", async ({ page }) => {
  const { deletes, errors } = await openClientSettings(page, true);
  await page.getByRole("button", { name: "Ver e editar informações de Empresa teste", exact: true }).click();
  const form = page.locator("form").filter({ has: page.getByRole("textbox", { name: "Nome da empresa", exact: true }) });
  const deleteButton = form.getByRole("button", { name: "Excluir cliente", exact: true });
  await expect(deleteButton).toBeVisible();
  await expect(deleteButton).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await deleteButton.click();
  await expect(page.getByRole("status")).toContainText("Cliente excluído com sucesso.");
  expect(deletes).toEqual(["/api/clients/own-client"]);
  expect(errors).toEqual([]);
});
