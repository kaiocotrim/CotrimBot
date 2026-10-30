import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  const state = { loginStatus: 200, missingHeader: false, invalidToken: false, bearerRequests: 0 };
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = {};
    if (path.endsWith("/auth/sign-in/email")) {
      expect(request.postDataJSON()).toEqual({ email: "kaio@example.invalid", password: "test-password" });
      await route.fulfill({ status: state.loginStatus, headers: state.missingHeader ? {} : { "set-auth-token": "sdk-test-token", "access-control-expose-headers": "set-auth-token" }, json: {} });
      return;
    }
    if (path.endsWith("/auth/get-session")) {
      if (request.headers().authorization) {
        expect(request.headers().authorization).toBe("Bearer sdk-test-token");
        expect(request.headers().cookie).toBeUndefined();
        state.bearerRequests++;
      }
      body = state.invalidToken && request.headers().authorization ? null : {
        user: { id: "kaio", name: "Kaio teste", email: "kaio@example.invalid", role: "user", emailVerified: true },
        session: { id: "test", userId: "kaio", expiresAt: "2099-01-01T00:00:00Z" },
      };
    } else if (path.endsWith("/contacts") || path.endsWith("/organization/list") || path.endsWith("/contacts/assignees")) body = [];
    else if (path.endsWith("/notifications")) body = { notifications: [], unreadCount: 0 };
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir configurações de Kaio teste" }).click();
  await page.getByRole("tab", { name: "API e SDK", exact: true }).click();
  return state;
}

async function login(page: Page) {
  await page.getByLabel("Senha da conta").fill("test-password");
  await page.getByRole("button", { name: "Obter token", exact: true }).click();
}

for (const width of [1280, 390]) {
  test(`obtém token e testa Bearer sem cookies (${width}px)`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const state = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("button", { name: "Obter token", exact: true })).toBeDisabled();
    // O cookie deve ser omitido no teste, mesmo quando a sessão web tem cookies.
    await context.addCookies([{ name: "web-session", value: "browser-only", url: "http://127.0.0.1:3100" }]);
    await login(page);
    const token = page.getByLabel("Token de sessão", { exact: true });
    await expect(token).toHaveValue("sdk-test-token");
    await expect(token).toHaveAttribute("type", "password");
    await expect(page.getByLabel("Senha da conta")).toHaveValue("");
    await page.getByRole("button", { name: "Mostrar token" }).click();
    await expect(token).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Copiar token" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("sdk-test-token");
    await page.getByRole("button", { name: "Testar requisição" }).click();
    await expect(page.getByRole("status")).toContainText("Requisição autenticada com sucesso");
    expect(state.bearerRequests).toBe(1);
    await page.getByRole("button", { name: "Ocultar token" }).click();
    await page.screenshot({ path: testInfo.outputPath(`sdk-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("tab", { name: "Conta", exact: true }).click();
    await page.getByRole("tab", { name: "API e SDK", exact: true }).click();
    await expect(token).toHaveCount(0);
  });
}

test("trata senha incorreta, cabeçalho ausente e sessão inválida", async ({ page }) => {
  const state = await setup(page);
  state.loginStatus = 401;
  await login(page);
  await expect(page.getByRole("alert")).toContainText("Confira sua senha");
  state.loginStatus = 200; state.missingHeader = true;
  await login(page);
  await expect(page.getByRole("alert")).toContainText("O servidor não disponibilizou o token");
  state.missingHeader = false;
  await login(page);
  await expect(page.getByLabel("Token de sessão", { exact: true })).toHaveValue("sdk-test-token");
  state.invalidToken = true;
  await page.getByRole("button", { name: "Testar requisição" }).click();
  await expect(page.getByRole("alert")).toContainText("Token expirado ou inválido");
});
