"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Tabs } from "@base-ui/react/tabs";
import { AppleLogo, GoogleLogo } from "@phosphor-icons/react";
import { BadgeCheck, Bell, Building2, Camera, Check, ChevronDown, PhoneOff, QrCode, UserRound, Volume2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EvolutionConnectionSettings } from "@/components/chat/evolution-connection-settings";
import { EvolutionCallSettings } from "@/components/chat/evolution-call-settings";
import { authClient } from "@/lib/auth-client";
import { readNotificationPermission } from "@/hooks/use-notifications";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import {
  getNotificationSoundPath,
  isNotificationSoundEnabled,
  NOTIFICATION_SOUND_OPTIONS,
  playNotificationSound,
  setNotificationSoundEnabled,
  setNotificationSoundPath,
} from "@/lib/notification-sound";
import { PWA_ENABLED, removePushSubscription } from "@/lib/pwa";
import styles from "./account-settings.module.css";

type SettingsUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
};

const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024;
const AVATAR_MAX_DATA_URL_LENGTH = 56_000;

async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > AVATAR_MAX_FILE_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
      element.src = objectUrl;
    });
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;

    for (const outputSize of [320, 256, 192]) {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível processar essa imagem.");
      context.fillStyle = "#18181b";
      context.fillRect(0, 0, outputSize, outputSize);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);

      for (const quality of [0.82, 0.68, 0.54, 0.42]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= AVATAR_MAX_DATA_URL_LENGTH) return dataUrl;
      }
    }
    throw new Error("Não foi possível reduzir a imagem. Escolha outra foto.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const sections = [
  { value: "account", label: "Conta", icon: UserRound },
  { value: "notifications", label: "Notificações", icon: Bell },
  { value: "pro", label: "Conta Pro", icon: BadgeCheck },
  { value: "whatsapp", label: "WhatsApp", icon: QrCode },
  { value: "calls", label: "Chamadas", icon: PhoneOff },
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
  const [avatar, setAvatar] = useState<string | null>(user.image ?? null);
  const [savedAvatar, setSavedAvatar] = useState<string | null>(user.image ?? null);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nameChanged = name.trim() !== savedName;
  const avatarChanged = avatar !== savedAvatar;
  const accountChanged = nameChanged || avatarChanged;
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
    if (saving || processingAvatar || !nextName || !accountChanged) return;
    setSaving(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      const { error } = await authClient.updateUser({ name: nextName, image: avatar });
      if (error) throw new Error("Não foi possível salvar sua conta. Tente novamente.");
      setSavedName(nextName);
      setSavedAvatar(avatar);
      setName(nextName);
      setAccountMessage("Conta atualizada.");
    } catch {
      setAccountError("Não foi possível salvar sua conta. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function selectAvatar(file: File | undefined) {
    if (!file || processingAvatar || saving) return;
    setProcessingAvatar(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      setAvatar(await prepareAvatar(file));
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Não foi possível processar essa imagem.");
    } finally {
      setProcessingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      // Este dispositivo deixa de receber push da conta que está saindo.
      await removePushSubscription().catch((error) => console.error(error));
      const { error } = await authClient.signOut();
      if (error) throw new Error("sign-out");
      router.replace("/login");
    } catch {
      setSignOutError("Não foi possível sair. Tente novamente.");
      setSigningOut(false);
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
                <div className={styles.profilePhotoRow}>
                  <div className={styles.profilePhoto} aria-hidden="true">
                    {avatar ? (
                      // A imagem pode vir de um provedor externo ou do upload do usuário.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" />
                    ) : (
                      <span>{name.trim().charAt(0).toUpperCase() || <UserRound size={28} />}</span>
                    )}
                  </div>
                  <div className={styles.profilePhotoActions}>
                    <strong>Foto de perfil</strong>
                    <span>JPG, PNG ou WebP. A foto será recortada em formato quadrado.</span>
                    <div>
                      <button
                        type="button"
                        className={styles.photoButton}
                        disabled={saving || processingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Camera size={16} aria-hidden="true" />
                        {processingAvatar ? "Processando…" : avatar ? "Trocar foto" : "Adicionar foto"}
                      </button>
                      {avatar && (
                        <button
                          type="button"
                          className={styles.removePhotoButton}
                          disabled={saving || processingAvatar}
                          onClick={() => {
                            setAvatar(null);
                            setAccountMessage(null);
                            setAccountError(null);
                          }}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <input
                      ref={avatarInputRef}
                      className={styles.visuallyHidden}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Escolher foto de perfil"
                      onChange={(event) => void selectAvatar(event.target.files?.[0])}
                    />
                  </div>
                </div>
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
                {accountChanged && <button type="submit" className={styles.primaryButton} disabled={saving || processingAvatar || !name.trim()}>{saving ? "Salvando…" : "Salvar alterações"}</button>}
                {accountMessage && <p role="status" className={styles.feedback}>{accountMessage}</p>}
                {accountError && <p role="alert" className={styles.error}>{accountError}</p>}
              </form>
            </section>

            <ConnectedAccounts />

          </Tabs.Panel>

          <Tabs.Panel value="notifications" className={styles.panel}>
            <NotificationSettings />
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

          <Tabs.Panel value="calls" className={styles.panel}>
            <EvolutionCallSettings />
          </Tabs.Panel>

        </div>
      </div>
    </Tabs.Root>
  );
}

function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(readNotificationPermission);
  const [soundEnabled, setSoundEnabled] = useState(isNotificationSoundEnabled);
  const [soundPath, setSoundPath] = useState(getNotificationSoundPath);

  async function requestPermission() {
    if (!("Notification" in window)) return "unsupported" as const;
    const result = await window.Notification.requestPermission();
    setPermission(result);
    return result;
  }
  const push = usePushSubscription({ requestPermission });

  async function enableDesktop() {
    if (push.supported) await push.subscribe();
    else await requestPermission();
  }

  function toggleSound() {
    const next = !soundEnabled;
    setNotificationSoundEnabled(next);
    setSoundEnabled(next);
    if (next) playNotificationSound();
  }

  function changeSound(path: string) {
    setNotificationSoundPath(path);
    setSoundPath(path);
    if (soundEnabled) playNotificationSound();
  }

  function sendTest() {
    new window.Notification("CotrimBot", { body: "As notificações do sistema estão funcionando.", icon: "/favicon.ico" });
    if (soundEnabled) playNotificationSound();
  }

  return (
    <>
      <section className={styles.card}>
        <h3>Notificações do sistema</h3>
        <p>Receba um aviso no sistema operacional quando uma conversa for atribuída a você ou uma conversa sua receber mensagem.</p>
        {permission === "unsupported" && <p>Este navegador não oferece suporte a notificações.</p>}
        {permission === "denied" && <p role="alert" className={styles.error}>As notificações estão bloqueadas. Libere-as nas configurações do site no navegador.</p>}
        {permission === "granted" && <span className={styles.badge}>Ativadas</span>}
        {permission === "default" && <button type="button" className={styles.primaryButton} onClick={() => void enableDesktop()}>Ativar notificações</button>}
        {permission === "granted" && <button type="button" className={styles.primaryButton} onClick={sendTest}>Enviar teste</button>}
      </section>
      <section className={styles.card}>
        <h3>Notificações push</h3>
        <p>Receba as notificações neste dispositivo mesmo com o CotrimBot fechado ou em segundo plano. Instale o app (PWA) para uma experiência melhor no celular.</p>
        {!PWA_ENABLED && <p>As notificações push ficam disponíveis apenas na versão de produção do app.</p>}
        {PWA_ENABLED && !push.supported && <p>Este navegador não oferece suporte a notificações push.</p>}
        {push.error && <p role="alert" className={styles.error}>{push.error}</p>}
        {push.supported && push.subscribed && <span className={styles.badge}>Ativadas neste dispositivo</span>}
        {push.supported && permission !== "denied" && (
          <button
            type="button"
            role="switch"
            aria-checked={push.subscribed}
            className={styles.primaryButton}
            disabled={push.loading}
            onClick={() => void (push.subscribed ? push.unsubscribe() : push.subscribe())}
          >
            {push.loading ? "Aguarde..." : push.subscribed ? "Desativar notificações push" : "Ativar notificações push"}
          </button>
        )}
      </section>
      <section className={styles.card}>
        <h3>Som</h3>
        <p>Toca um aviso sonoro ao receber uma nova notificação.</p>
        <div className={styles.soundSettings}>
          <Select.Root
            items={NOTIFICATION_SOUND_OPTIONS.map((option) => ({ value: option.path, label: option.label }))}
            value={soundPath}
            onValueChange={(value) => {
              if (value) changeSound(value);
            }}
          >
            <div className={styles.soundField}>
              <Select.Label className={styles.soundLabel}>Áudio da notificação</Select.Label>
              <Select.Trigger className={styles.soundTrigger}>
                <Volume2 aria-hidden="true" className={styles.soundTriggerIcon} />
                <Select.Value className={styles.soundValue} />
                <Select.Icon className={styles.soundChevron}>
                  <ChevronDown aria-hidden="true" />
                </Select.Icon>
              </Select.Trigger>
            </div>
            <Select.Portal>
              <Select.Positioner sideOffset={8} align="start" alignItemWithTrigger={false} className={styles.soundPositioner}>
                <Select.Popup className={styles.soundPopup}>
                  <Select.List className={styles.soundList}>
                    {NOTIFICATION_SOUND_OPTIONS.map((option) => (
                      <Select.Item key={option.path} value={option.path} className={styles.soundOption}>
                        <Select.ItemText>{option.label}</Select.ItemText>
                        <Select.ItemIndicator className={styles.soundOptionIndicator}>
                          <Check aria-hidden="true" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>

          <div className={styles.soundToggleRow}>
            <div>
              <span className={styles.soundToggleTitle}>Reproduzir sons</span>
              <span className={styles.soundToggleHint}>
                {soundEnabled ? "Ativado para novas notificações" : "Nenhum som será reproduzido"}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-label={soundEnabled ? "Desativar som" : "Ativar som"}
              className={styles.soundSwitch}
              onClick={toggleSound}
            >
              <span className={styles.soundSwitchThumb} />
            </button>
          </div>
        </div>
      </section>
    </>
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
