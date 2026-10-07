"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { AppleLogo, GoogleLogo } from "@phosphor-icons/react";
import { BadgeCheck, Bell, Building2, QrCode, Trash2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EvolutionConnectionSettings } from "@/components/chat/evolution-connection-settings";
import { authClient } from "@/lib/auth-client";
import { deleteAllConversations } from "@/lib/chat-api";
import styles from "./account-settings.module.css";

type SettingsUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
};

const sections = [
  { value: "account", label: "Conta", icon: UserRound },
  { value: "notifications", label: "Notificações", icon: Bell },
  { value: "pro", label: "Conta Pro", icon: BadgeCheck },
  { value: "whatsapp", label: "WhatsApp", icon: QrCode },
  { value: "business", label: "Empresa", icon: Building2 },
] as const;

type Section = typeof sections[number]["value"];

export function AccountSettings({ user, children, onOpen }: {
  user: SettingsUser;
  children: ReactNode;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) onOpen();
    }}>
      <Dialog.Trigger
        aria-label={`Abrir configurações de ${user.name || "usuário"}`}
        title="Configurações da conta"
        className={styles.avatarTrigger}
      >
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog}>
          <SettingsContent key={user.id} user={user} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsContent({ user }: { user: SettingsUser }) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("account");
  const [name, setName] = useState(user.name);
  const [savedName, setSavedName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [deletingConversations, setDeletingConversations] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nameChanged = name.trim() !== savedName;
  const availableSections = user.role === "admin"
    ? sections
    : sections.filter((item) => item.value !== "whatsapp");

  function changeSection(value: Section) {
    if (value === "business") {
      router.push("/empresa");
      return;
    }
    setSection(value);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (saving || !nextName || !nameChanged) return;
    setSaving(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const { error } = await authClient.updateUser({ name: nextName });
      if (error) throw new Error("Não foi possível salvar seu nome. Tente novamente.");
      setSavedName(nextName);
      setName(nextName);
      setAccountMessage("Nome atualizado.");
    } catch {
      setAccountError("Não foi possível salvar seu nome. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error("sign-out");
      router.replace("/login");
    } catch {
      setSignOutError("Não foi possível sair. Tente novamente.");
      setSigningOut(false);
    }
  }

  async function clearConversations() {
    if (deletingConversations) return;
    const confirmed = window.confirm("Apagar todas as conversas, contatos e mídias salvas? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    const confirmation = window.prompt('Para confirmar, digite "APAGAR".');
    if (confirmation !== "APAGAR") {
      if (confirmation !== null) setDeleteError('Confirmação incorreta. Digite "APAGAR".');
      return;
    }

    setDeletingConversations(true);
    setDeleteMessage(null);
    setDeleteError(null);
    try {
      const result = await deleteAllConversations();
      window.dispatchEvent(new Event("cotrimbot:conversations-cleared"));
      setDeleteMessage(`${result.contacts} ${result.contacts === 1 ? "conversa apagada" : "conversas apagadas"}.`);
    } catch (clearError) {
      setDeleteError(clearError instanceof Error ? clearError.message : "Não foi possível apagar as conversas.");
    } finally {
      setDeletingConversations(false);
    }
  }

  return (
    <Tabs.Root value={section} onValueChange={(value) => changeSection(value as Section)} orientation="vertical" className={styles.layout}>
      <aside className={styles.sidebar}>
        <Dialog.Title className={styles.title}>Configurações</Dialog.Title>
        <Tabs.List aria-label="Seções de configurações" className={styles.navigation}>
          {availableSections.map(({ value, label, icon: Icon }) => (
            <Tabs.Tab key={value} value={value} className={styles.navItem}>
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <footer className={styles.footer}>
          <span>CotrimBot</span>
          <button type="button" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? "Saindo…" : "Sair da conta"}
          </button>
          {signOutError && <p role="alert" className={styles.error}>{signOutError}</p>}
        </footer>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <h2 className={styles.title}>{availableSections.find((item) => item.value === section)?.label}</h2>
          <Dialog.Close aria-label="Fechar configurações" title="Fechar" className={styles.closeButton}>
            <X size={24} strokeWidth={1.8} aria-hidden="true" />
          </Dialog.Close>
        </header>

        <div ref={scrollRef} className={styles.scrollArea}>
          <Tabs.Panel value="account" className={styles.panel}>
            <section className={`${styles.card} ${styles.subscription}`} aria-labelledby="subscription-title">
              <h3 id="subscription-title">Assinatura Pro</h3>
              <p>Gerencie sua conta e suas conexões em um só lugar. O plano Pro ainda não está disponível no CotrimBot. Você poderá acompanhar as novidades por aqui.</p>
              <button type="button" className={styles.primaryButton} onClick={() => changeSection("pro")}>Conhecer o Pro</button>
            </section>

            <section className={styles.card} aria-labelledby="account-title">
              <h3 id="account-title">Conta</h3>
              <form className={styles.accountForm} onSubmit={(event) => void saveAccount(event)}>
                <label className={styles.field}>
                  <span>E-mail</span>
                  <input type="email" value={user.email} readOnly autoComplete="email" />
                </label>
                <label className={styles.field}>
                  <span>Nome</span>
                  <span className={styles.inputWithIcon}>
                    <UserRound size={16} strokeWidth={1.8} aria-hidden="true" />
                    <input
                      name="name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setAccountMessage(null);
                        setAccountError(null);
                      }}
                      autoComplete="name"
                      required
                      maxLength={100}
                      disabled={saving}
                    />
                  </span>
                </label>
                {nameChanged && <button type="submit" className={styles.primaryButton} disabled={saving || !name.trim()}>{saving ? "Salvando…" : "Salvar alterações"}</button>}
                {accountMessage && <p role="status" className={styles.feedback}>{accountMessage}</p>}
                {accountError && <p role="alert" className={styles.error}>{accountError}</p>}
              </form>
            </section>

            <ConnectedAccounts />

            {user.role === "admin" && (
              <section className={`${styles.card} ${styles.dangerZone}`} aria-labelledby="danger-zone-title">
                <div>
                  <h3 id="danger-zone-title">Apagar conversas</h3>
                  <p>Remove permanentemente todas as conversas, contatos e mídias salvas no CotrimBot. Use antes de conectar um número novo.</p>
                </div>
                <button type="button" className={styles.dangerButton} disabled={deletingConversations} onClick={() => void clearConversations()}>
                  <Trash2 size={16} aria-hidden="true" />
                  {deletingConversations ? "Apagando tudo…" : "Apagar todas as conversas"}
                </button>
                {deleteMessage && <p role="status" className={styles.feedback}>{deleteMessage}</p>}
                {deleteError && <p role="alert" className={styles.error}>{deleteError}</p>}
              </section>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="notifications" className={styles.panel}>
            <section className={styles.card}>
              <h3>Notificações</h3>
              <p>Suas mensagens e os indicadores de conversas não lidas continuam disponíveis no chat. As preferências de notificações ainda não estão disponíveis.</p>
              <span className={styles.badge}>Em breve</span>
            </section>
          </Tabs.Panel>

          <Tabs.Panel value="pro" className={styles.panel}>
            <section className={styles.card}>
              <h3>Assinatura Pro</h3>
              <p>O plano Pro ainda não está disponível no CotrimBot. Quando houver planos para contratar, os detalhes e valores aparecerão aqui.</p>
              <button type="button" className={styles.primaryButton} disabled>Em breve</button>
            </section>
          </Tabs.Panel>

          {user.role === "admin" && (
            <Tabs.Panel value="whatsapp" className={styles.panel}>
              <EvolutionConnectionSettings />
            </Tabs.Panel>
          )}

        </div>
      </div>
    </Tabs.Root>
  );
}

function ConnectedAccounts() {
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadAccounts() {
      try {
        const { data, error } = await authClient.listAccounts();
        if (!active) return;
        if (error || !data) throw new Error("accounts");
        setGoogleConnected(data.some((account) => account.providerId === "google"));
      } catch {
        if (active) setError("Não foi possível carregar suas conexões.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadAccounts();
    return () => { active = false; };
  }, [attempt]);

  async function connectGoogle() {
    if (connecting || loading || googleConnected !== false) return;
    setConnecting(true);
    setError(null);
    try {
      const { error } = await authClient.linkSocial({ provider: "google", callbackURL: window.location.href });
      if (error) throw new Error("google");
    } catch {
      setError("Não foi possível conectar ao Google. Tente novamente ou fale com o administrador.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <section className={`${styles.card} ${styles.connections}`} aria-labelledby="connections-title">
      <h3 id="connections-title">Contas conectadas</h3>
      <p>Conecte um provedor para entrar nesta mesma conta. Seus dados e suas conversas continuam aqui. Os convites usam o e-mail da sua conta.</p>
      <div className={styles.providers}>
        <button
          type="button"
          className={`${styles.providerButton} ${googleConnected ? styles.connected : ""}`}
          disabled={loading || connecting || googleConnected !== false}
          onClick={() => void connectGoogle()}
        >
          <GoogleLogo size={20} weight="bold" aria-hidden="true" />
          {loading ? "Carregando conexões…" : connecting ? "Conectando…" : googleConnected ? "Google conectado" : "Conectar Google"}
        </button>
        <button type="button" className={styles.providerButton} disabled aria-describedby="apple-unavailable">
          <AppleLogo size={21} weight="fill" aria-hidden="true" />
          Conectar Apple
        </button>
      </div>
      <p id="apple-unavailable" className={styles.hint}>A conexão com a Apple ainda não está disponível.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && googleConnected === null && <button type="button" className={styles.textButton} onClick={() => {
        setError(null);
        setLoading(true);
        setAttempt((current) => current + 1);
      }}>Tentar novamente</button>}
    </section>
  );
}
