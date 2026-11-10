"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Play, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import shared from "./account-settings.module.css";
import styles from "./sdk-settings.module.css";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/$/, "");

type ApiKeyItem = {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  enabled: boolean;
  createdAt: string;
};

type Busy = "list" | "create" | "test" | string | null;

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export function SdkSettings() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<Busy>("list");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadKeys();
  }, []);

  async function loadKeys() {
    setBusy("list");
    const { data, error: requestError } = await authClient.$fetch<{ apiKeys: ApiKeyItem[] }>("/api-key/list", { method: "GET" });
    if (requestError) setError(errorMessage(requestError, "Não foi possível carregar as chaves."));
    else setKeys(data?.apiKeys ?? []);
    setBusy(null);
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("create"); setError(""); setMessage(""); setCreatedKey(""); setVisible(false);
    const { data, error: requestError } = await authClient.$fetch<{ key: string }>("/api-key/create", {
      method: "POST",
      body: { name: name.trim() || "SDK" },
    });
    if (requestError || !data?.key) {
      setError(errorMessage(requestError, "Não foi possível gerar a chave. Tente novamente."));
    } else {
      setCreatedKey(data.key);
      setName("");
      setMessage("Chave gerada. Copie-a agora: ela não será exibida novamente.");
      await loadKeys();
      return;
    }
    setBusy(null);
  }

  async function revokeKey(key: ApiKeyItem) {
    if (busy) return;
    if (!window.confirm(`Revogar a chave “${key.name ?? "sem nome"}”? Integrações que a usam deixarão de funcionar.`)) return;
    setBusy(key.id); setError(""); setMessage("");
    const { error: requestError } = await authClient.$fetch("/api-key/delete", {
      method: "POST",
      body: { keyId: key.id },
    });
    if (requestError) {
      setError(errorMessage(requestError, "Não foi possível revogar a chave."));
      setBusy(null);
      return;
    }
    setMessage("Chave revogada.");
    await loadKeys();
  }

  async function testKey() {
    if (busy || !createdKey) return;
    setBusy("test"); setError(""); setMessage("");
    try {
      // Sem cookies: o teste valida somente a chave, não a sessão do navegador.
      const response = await fetch(`${API_URL}/auth/get-session`, {
        credentials: "omit",
        headers: { "x-api-key": createdKey },
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) throw new Error("Chave inválida ou revogada.");
      if (!response.ok) throw new Error("Não foi possível testar a chave. Tente novamente.");
      const data = await response.json();
      if (!data?.session || !data?.user) throw new Error("Chave inválida ou revogada.");
      setMessage(`Chave válida. Requisição autenticada para ${data.user.email ?? "sua conta"} (HTTP ${response.status}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na conexão com o servidor.");
    } finally {
      setBusy(null);
    }
  }

  async function copyKey() {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(createdKey);
      setMessage("Chave copiada.");
    } catch {
      setError("Não foi possível copiar. Use Mostrar chave e copie o campo manualmente.");
    }
  }

  return (
    <div className={styles.root}>
      <section className={shared.card} aria-labelledby="sdk-key-title">
        <h3 id="sdk-key-title">Gerar chave de API</h3>
        <p>Crie uma chave para usar o SDK em integrações server-to-server. Ela não expira automaticamente e pode ser revogada a qualquer momento.</p>
        <form className={shared.accountForm} onSubmit={createKey}>
          <label className={shared.field}>
            <span>Nome da chave (opcional)</span>
            <input type="text" value={name} maxLength={64} placeholder="Ex.: Integração do CRM" onChange={(event) => setName(event.target.value)} disabled={busy !== null} />
          </label>
          <button type="submit" className={`${shared.primaryButton} ${styles.button}`} disabled={busy !== null}>
            {busy === "create" ? <Loader2 size={16} className={styles.spinner} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
            {busy === "create" ? "Gerando chave…" : "Gerar chave de API"}
          </button>
        </form>
      </section>

      {createdKey && (
        <section className={shared.card} aria-labelledby="sdk-result-title">
          <h3 id="sdk-result-title">Sua nova chave</h3>
          <p>Guarde-a em um secret manager. Por segurança, ela só é exibida uma vez.</p>
          <label className={`${shared.field} ${styles.tokenField}`}>
            <span>Chave de API</span>
            <input className={styles.token} type={visible ? "text" : "password"} value={createdKey} readOnly autoComplete="off" spellCheck={false} />
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setVisible(!visible)} aria-pressed={visible}>
              {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{visible ? "Ocultar chave" : "Mostrar chave"}
            </button>
            <button type="button" className={styles.secondary} onClick={() => void copyKey()}><Copy size={16} aria-hidden="true" />Copiar chave</button>
            <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => void testKey()}>
              {busy === "test" ? <Loader2 size={16} className={styles.spinner} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {busy === "test" ? "Testando…" : "Testar chave"}
            </button>
            <button type="button" className={styles.secondary} onClick={() => { setCreatedKey(""); setVisible(false); }}>Fechar</button>
          </div>
          <p className={styles.hint}>O teste envia a chave no cabeçalho x-api-key, sem usar a sessão do navegador.</p>
        </section>
      )}

      <section className={shared.card} aria-labelledby="sdk-list-title">
        <h3 id="sdk-list-title">Chaves ativas</h3>
        {busy === "list" && keys.length === 0 ? (
          <p className={styles.hint}>Carregando chaves…</p>
        ) : keys.length === 0 ? (
          <p className={styles.hint}>Nenhuma chave ativa.</p>
        ) : (
          <ul className={styles.keyList}>
            {keys.map((key) => (
              <li key={key.id} className={styles.keyItem}>
                <div>
                  <strong>{key.name ?? "Sem nome"}</strong>
                  <span className={styles.hint}>
                    {" "}· {key.start ?? key.prefix ?? "chave"}… · criada em {new Date(key.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <button type="button" className={`${styles.secondary} ${styles.danger}`} disabled={busy !== null} onClick={() => void revokeKey(key)}>
                  {busy === key.id ? <Loader2 size={16} className={styles.spinner} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && <p role="status" className={shared.feedback}>{message}</p>}
      {error && <p role="alert" className={shared.error}>{error}</p>}

      <section className={shared.card} aria-labelledby="sdk-example-title">
        <h3 id="sdk-example-title">Usar no SDK</h3>
        <p>No seu servidor, configure COTRIMBOT_URL com a URL do backend e COTRIMBOT_API_KEY com a chave gerada.</p>
        <pre className={styles.code}><code>{`import { CotrimBotClient } from "@cotrimbot/sdk";

const client = new CotrimBotClient({
  baseUrl: process.env.COTRIMBOT_URL!,
  apiKey: process.env.COTRIMBOT_API_KEY!,
});

const session = await client.auth.getSession();`}</code></pre>
      </section>
    </div>
  );
}
