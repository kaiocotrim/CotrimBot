import { expect, test, type Page } from "@playwright/test";

type ApiKey = { id: string; name: string | null; start: string; prefix: string | null; enabled: boolean; createdAt: string; key: string };

async function setup(page: Page) {
  const state = { createStatus: 200, keys: [] as ApiKey[], apiKeyRequests: 0, nextId: 1 };
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    let body: unknown = {};
    if (path.endsWith("/auth/api-key/create")) {
      expect(request.method()).toBe("POST");
      const payload = request.postDataJSON() as { name?: string };
      if (state.createStatus !== 200) {
        status = state.createStatus;
        body = { message: "Falha ao gerar a chave." };
      } else {
        const key = `cb_test_${state.nextId}`;
        const item: ApiKey = { id: `key-${state.nextId}`, name: payload.name ?? null, start: key.slice(0, 8), prefix: "cb", enabled: true, createdAt: "2026-10-30T12:00:00Z", key };
        state.nextId++;
        state.keys.push(item);
        body = item;
      }
    } else if (path.endsWith("/auth/api-key/list")) {
      body = { apiKeys: state.keys.map(({ id, name, start, prefix, enabled, createdAt }) => ({ id, name, start, prefix, enabled, createdAt })) };
    } else if (path.endsWith("/auth/api-key/delete")) {
      const { keyId } = request.postDataJSON() as { keyId: string };
      state.keys = state.keys.filter((item) => item.id !== keyId);
      body = { success: true };
    } else if (path.endsWith("/auth/get-session")) {
      const apiKey = request.headers()["x-api-key"];
      if (apiKey) {
        expect(request.headers().cookie).toBeUndefined();
        state.apiKeyRequests++;
        const valid = state.keys.some((item) => item.key === apiKey);
        if (!valid) {
          status = 401;
          body = null;
        } else {
          body = {
            user: { id: "kaio", name: "Kaio teste", email: "kaio@example.invalid", role: "user", emailVerified: true },
            session: { id: "test", userId: "kaio", expiresAt: "2099-01-01T00:00:00Z" },
          };
        }
      } else {
        body = {
          user: { id: "kaio", name: "Kaio teste", email: "kaio@example.invalid", role: "user", emailVerified: true },
          session: { id: "test", userId: "kaio", expiresAt: "2099-01-01T00:00:00Z" },
        };
      }
    } else if (path.endsWith("/contacts") || path.endsWith("/organization/list") || path.endsWith("/contacts/assignees")) body = [];
    else if (path.endsWith("/notifications")) body = { notifications: [], unreadCount: 0 };
    await route.fulfill({ status, json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir configurações de Kaio teste" }).click();
  await page.getByRole("tab", { name: "API e SDK", exact: true }).click();
  return state;
}

for (const width of [1280, 390]) {
  test(`gera, testa e revoga chave de API (${width}px)`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const state = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByText("Nenhuma chave ativa.")).toBeVisible();
    // A sessão do navegador tem cookies; o teste da chave não deve enviá-los.
    await context.addCookies([{ name: "web-session", value: "browser-only", url: "http://127.0.0.1:3100" }]);

    await page.getByLabel("Nome da chave (opcional)").fill("CRM");
    await page.getByRole("button", { name: "Gerar chave de API", exact: true }).click();
    const key = page.getByLabel("Chave de API", { exact: true });
    await expect(key).toHaveValue("cb_test_1");
    await expect(key).toHaveAttribute("type", "password");
    await expect(page.getByRole("status")).toContainText("ela não será exibida novamente");
    await expect(page.getByText("CRM", { exact: false }).first()).toBeVisible();

    await page.getByRole("button", { name: "Mostrar chave" }).click();
    await expect(key).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Copiar chave" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("cb_test_1");

    await page.getByRole("button", { name: "Testar chave" }).click();
    await expect(page.getByRole("status")).toContainText("Chave válida");
    expect(state.apiKeyRequests).toBe(1);
    await page.getByRole("button", { name: "Ocultar chave" }).click();
    await page.screenshot({ path: testInfo.outputPath(`sdk-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Revogar", exact: true }).click();
    await expect(page.getByText("Nenhuma chave ativa.")).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(key).toHaveCount(0);
    await page.getByRole("tab", { name: "Conta", exact: true }).click();
    await page.getByRole("tab", { name: "API e SDK", exact: true }).click();
    await expect(page.getByText("Nenhuma chave ativa.")).toBeVisible();
  });
}

test("trata falha ao gerar chave e chave revogada", async ({ page }) => {
  const state = await setup(page);
  state.createStatus = 500;
  await page.getByRole("button", { name: "Gerar chave de API", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Falha ao gerar a chave.");

  state.createStatus = 200;
  await page.getByRole("button", { name: "Gerar chave de API", exact: true }).click();
  await expect(page.getByLabel("Chave de API", { exact: true })).toHaveValue("cb_test_1");
  // Revoga a chave diretamente no backend simulado para que o teste retorne 401.
  state.keys = [];
  await page.getByRole("button", { name: "Testar chave" }).click();
  await expect(page.getByRole("alert")).toContainText("Chave inválida ou revogada.");
});
