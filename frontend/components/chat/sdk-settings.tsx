"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Play } from "lucide-react";
import shared from "./account-settings.module.css";
import styles from "./sdk-settings.module.css";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/$/, "");

export function SdkSettings({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<"login" | "test" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function obtainToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !password) return;
    const request = new AbortController();
    controller.current = request;
    setBusy("login"); setError(""); setMessage(""); setToken(""); setVisible(false);
    try {
      // Mesmo endpoint e cabeçalho usados por client.auth.signInEmail() no SDK.
      const response = await fetch(`${API_URL}/auth/sign-in/email`, {
        method: "POST",
        // A sessão criada para a integração não substitui o cookie da conta aberta.
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: request.signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 400) throw new Error("Não foi possível autenticar. Confira sua senha.");
        if (response.status === 429) throw new Error("Muitas tentativas. Aguarde um pouco antes de tentar novamente.");
        throw new Error("Não foi possível obter o token. Tente novamente.");
      }
      const authToken = response.headers.get("set-auth-token");
      if (!authToken) throw new Error("O servidor não disponibilizou o token. Verifique a configuração do cabeçalho set-auth-token no backend.");
      setToken(authToken);
      setMessage("Token obtido. Você já pode copiá-lo ou testar a autenticação.");
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : "Falha na conexão com o servidor.");
    } finally {
      if (!request.signal.aborted) { setPassword(""); setBusy(null); }
    }
  }

  async function testRequest() {
    if (busy || !token) return;
    const request = new AbortController();
    controller.current = request;
    setBusy("test"); setError(""); setMessage("");
    try {
      // Omitir cookies garante que o teste valide o Bearer, sem usar a sessão do navegador.
      const response = await fetch(`${API_URL}/auth/get-session`, {
        credentials: "omit",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: request.signal,
      });
      if (response.status === 401 || response.status === 403) throw new Error("Token expirado ou inválido. Obtenha um novo token.");
      if (!response.ok) throw new Error("Não foi possível testar a requisição. Tente novamente.");
      const data = await response.json();
      if (!data?.session || !data?.user) throw new Error("Token expirado ou inválido. Obtenha um novo token.");
      setMessage(`Requisição autenticada com sucesso para ${data.user.email ?? email} (HTTP ${response.status}).`);
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : "Falha na conexão com o servidor.");
    } finally {
      if (!request.signal.aborted) setBusy(null);
    }
  }

  async function copyToken() {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(token);
      setMessage("Token copiado.");
    } catch {
      setError("Não foi possível copiar. Use Mostrar token e copie o campo manualmente.");
    }
  }

  return (
    <div className={styles.root}>
      <section className={shared.card} aria-labelledby="sdk-token-title">
        <h3 id="sdk-token-title">Token de acesso</h3>
        <p>Autentique sua conta para obter o token usado nas requisições da API e do SDK.</p>
        <form className={shared.accountForm} onSubmit={obtainToken}>
          <label className={shared.field}>
            <span>E-mail da conta</span>
            <input type="email" autoComplete="username" value={email} readOnly />
          </label>
          <label className={shared.field}>
            <span>Senha da conta</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy !== null} />
          </label>
          <p className={styles.hint}>Use a senha do CotrimBot. Se você entra com Google, defina uma senha pela opção “Esqueci minha senha” na tela de login.</p>
          <button type="submit" className={`${shared.primaryButton} ${styles.button}`} disabled={busy !== null || !password}>
            {busy === "login" ? <Loader2 size={16} className={styles.spinner} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
            {busy === "login" ? "Obtendo token…" : "Obter token"}
          </button>
        </form>
      </section>

      {token && (
        <section className={shared.card} aria-labelledby="sdk-result-title">
          <h3 id="sdk-result-title">Seu token</h3>
          <p>Este token dá acesso à sua conta e expira com a sessão. Guarde-o em local seguro. Ele fica apenas na memória desta aba.</p>
          <label className={`${shared.field} ${styles.tokenField}`}>
            <span>Token de sessão</span>
            <input className={styles.token} type={visible ? "text" : "password"} value={token} readOnly autoComplete="off" spellCheck={false} />
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setVisible(!visible)} aria-pressed={visible}>
              {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{visible ? "Ocultar token" : "Mostrar token"}
            </button>
            <button type="button" className={styles.secondary} onClick={() => void copyToken()}><Copy size={16} aria-hidden="true" />Copiar token</button>
            <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => void testRequest()}>
              {busy === "test" ? <Loader2 size={16} className={styles.spinner} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {busy === "test" ? "Testando…" : "Testar requisição"}
            </button>
          </div>
          <p className={styles.hint}>O teste consulta sua sessão usando o cabeçalho Authorization: Bearer.</p>
        </section>
      )}

      {message && <p role="status" className={shared.feedback}>{message}</p>}
      {error && <p role="alert" className={shared.error}>{error}</p>}

      <section className={shared.card} aria-labelledby="sdk-example-title">
        <h3 id="sdk-example-title">Usar no SDK</h3>
        <p>No seu servidor, configure COTRIMBOT_URL com a URL do backend e COTRIMBOT_TOKEN com o token copiado.</p>
        <pre className={styles.code}><code>{`import { CotrimBotClient } from "@cotrimbot/sdk";

const client = new CotrimBotClient({
  baseUrl: process.env.COTRIMBOT_URL!,
  token: process.env.COTRIMBOT_TOKEN!,
});

const session = await client.auth.getSession();`}</code></pre>
      </section>
    </div>
  );
}
