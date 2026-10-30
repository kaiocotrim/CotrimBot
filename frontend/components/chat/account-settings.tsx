"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import { Tabs } from "@base-ui/react/tabs";
import { AppleLogo, GoogleLogo } from "@phosphor-icons/react";
import { BadgeCheck, Bell, Bot, Building2, Camera, Check, ChevronDown, ContactRound, KeyRound, Laptop, Link2, Megaphone, Palette, PhoneOff, Plus, QrCode, Search, Trash2, UserRound, Volume2, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { SuccessConfetti } from "@/components/chat/success-confetti";
import { EvolutionConnectionSettings } from "@/components/chat/evolution-connection-settings";
import { EvolutionCallSettings } from "@/components/chat/evolution-call-settings";
import { AnnouncementSettings } from "@/components/chat/announcement-settings";
import { ThemeSettings } from "@/components/chat/theme-settings";
import { SdkSettings } from "@/components/chat/sdk-settings";
import { authClient } from "@/lib/auth-client";
import { checkLocalTranscription, isLocalTranscriptionEnabled, setLocalTranscriptionEnabled } from "@/lib/local-transcription";
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
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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
  { value: "theme", label: "Tema", icon: Palette },
  { value: "client", label: "Cliente", icon: ContactRound },
  { value: "notifications", label: "Notificações", icon: Bell },
  { value: "pro", label: "Conta Pro", icon: BadgeCheck },
  { value: "whatsapp", label: "WhatsApp", icon: QrCode },
  { value: "calls", label: "Chamadas", icon: PhoneOff },
  { value: "business", label: "Empresa", icon: Building2 },
  { value: "announcements", label: "Notícias", icon: Megaphone },
  { value: "bots", label: "Central de Bots", icon: Bot },
  { value: "sdk", label: "API e SDK", icon: KeyRound },
  { value: "local", label: "Transcrição local", icon: Laptop },
] as const;

const MotionPanel = motion.create(Tabs.Panel);
const settingsSpring = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const;

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
  const reduceMotion = useReducedMotion();
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
    if (value === "bots") {
      router.push("/dashboard/bots/entrada/");
      return;
    }
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
        <LayoutGroup>
        <Tabs.List aria-label="Seções de configurações" className={styles.navigation}>
          {availableSections.map(({ value, label, icon: Icon }) => (
            <Tabs.Tab key={value} value={value} className={styles.navItem}>
              {section === value && <motion.span aria-hidden="true" className={styles.navHighlight} layoutId="settings-selection" transition={reduceMotion ? { duration: 0 } : settingsSpring} />}
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        </LayoutGroup>
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
          {section !== "client" && <h2 className={styles.title}>{availableSections.find((item) => item.value === section)?.label}</h2>}
          <Dialog.Close aria-label="Fechar configurações" title="Fechar" className={styles.closeButton}>
            <X size={24} strokeWidth={1.8} aria-hidden="true" />
          </Dialog.Close>
        </header>

        <div ref={scrollRef} className={styles.scrollArea}>
          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="account" className={styles.panel}>
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

          </MotionPanel>

          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="theme" className={styles.panel}>
            <ThemeSettings />
          </MotionPanel>
          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="sdk" className={styles.panel}>
            {section === "sdk" && <SdkSettings email={user.email} />}
          </MotionPanel>
          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="notifications" className={styles.panel}>
            <NotificationSettings />
          </MotionPanel>

          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="client" data-client-panel="" className={styles.panel}>
            <ClientSettings />
          </MotionPanel>

          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="announcements" className={styles.panel}>
            <AnnouncementSettings />
          </MotionPanel>

          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="pro" className={styles.panel}>
            <section className={styles.card}>
              <h3>Assinatura Pro</h3>
              <p>O plano Pro ainda não está disponível no CotrimBot. Quando houver planos para contratar, os detalhes e valores aparecerão aqui.</p>
              <button type="button" className={styles.primaryButton} disabled>Em breve</button>
            </section>
          </MotionPanel>

          {user.role === "admin" && (
            <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="whatsapp" className={styles.panel}>
              <EvolutionConnectionSettings />
            </MotionPanel>
          )}

          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="calls" className={styles.panel}>
            <EvolutionCallSettings />
          </MotionPanel>

          <MotionPanel initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : settingsSpring} value="local" className={styles.panel}>
            <LocalServiceSettings />
          </MotionPanel>

        </div>
      </div>
    </Tabs.Root>
  );
}

function LocalServiceSettings() {
  const [status, setStatus] = useState<"idle" | "checking" | "online" | "offline">("idle");
  const [enabled, setEnabled] = useState(isLocalTranscriptionEnabled);

  async function checkLocalService() {
    setStatus("checking");
    try {
      await checkLocalTranscription();
      setStatus("online");
    } catch {
      setStatus("offline");
    }
  }

  return (
    <>
      <section className={styles.card}>
        <h3>Transcrição local</h3>
        <p>
          Configure o <strong>CotrimBotTranscritor.exe</strong> uma vez para transcrever
          os áudios no seu computador. Ele inicia com o Windows e funciona em segundo plano, sem janela aberta.
        </p>
        <ol>
          <li>Baixe o ZIP para Windows e extraia todos os arquivos.</li>
          <li>Abra <code>CotrimBotTranscritor.exe</code> uma vez na pasta extraída para instalar e ativar a inicialização automática.</li>
          <li>Aguarde o primeiro download do modelo de transcrição.</li>
          <li>Ative a opção abaixo e clique em Verificar conexão. Nas próximas entradas no Windows, o transcritor inicia sozinho.</li>
        </ol>
        <div className={styles.localServiceActions}>
          <a
            href="https://www.mediafire.com/file/qq78n7yjcbg3tl8/CotrimBotTranscritor.zip/file"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.primaryButton}
          >
            Baixar para Windows (.zip)
          </a>
          <a
            href="http://127.0.0.1:8765/"
            target="_blank"
            rel="noreferrer"
            className={styles.secondaryButton}
          >
            Abrir status do serviço
          </a>
        </div>
        <p>Para desativar a inicialização automática, acesse Configurações do Windows → Aplicativos → Inicialização → CotrimBotTranscritor.</p>
      </section>

      <section className={styles.card}>
        <h3>Status do serviço</h3>
        <label>
          <input type="checkbox" checked={enabled} onChange={(event) => {
            const next = event.target.checked;
            setLocalTranscriptionEnabled(next);
            setEnabled(next);
            if (next) void checkLocalService();
          }} />{" "}
          Usar transcrição local neste navegador
        </label>
        <p>
          O serviço local deve responder em <code>http://127.0.0.1:8765</code>.
        </p>
        <button type="button" className={styles.secondaryButton} onClick={() => void checkLocalService()} disabled={status === "checking"}>
          {status === "checking" ? "Verificando…" : "Verificar conexão"}
        </button>
        {status === "online" && <p role="status" className={styles.feedback}>Serviço local conectado.</p>}
        {status === "offline" && <p role="alert" className={styles.error}>Serviço local indisponível. Abra o CotrimBotTranscritor.exe, aguarde o modelo carregar e permita o acesso à rede local no navegador.</p>}
      </section>
    </>
  );
}

type ClientProfile = {
  companyName: string;
  links: string[];
};

function LegacyClientSettings() {
  const [companyName, setCompanyName] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [savedProfile, setSavedProfile] = useState<ClientProfile>({ companyName: "", links: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizedLinks = links.map((link) => link.trim()).filter(Boolean);
  const changed = companyName.trim() !== savedProfile.companyName
    || JSON.stringify(normalizedLinks) !== JSON.stringify(savedProfile.links);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProfile() {
      try {
        const response = await fetch(`${API_URL}/client-profile`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as { profile?: ClientProfile; error?: string };
        if (!response.ok || !payload.profile) throw new Error(payload.error || "Não foi possível carregar os dados do cliente.");
        if (controller.signal.aborted) return;
        const profile = {
          companyName: payload.profile.companyName ?? "",
          links: Array.isArray(payload.profile.links) ? payload.profile.links : [],
        };
        setCompanyName(profile.companyName);
        setLinks(profile.links);
        setSavedProfile(profile);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados do cliente.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProfile();
    return () => controller.abort();
  }, []);

  async function saveClientProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCompanyName = companyName.trim();
    if (saving || !changed || !nextCompanyName) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`${API_URL}/client-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: nextCompanyName, links: normalizedLinks }),
      });
      const payload = await response.json().catch(() => ({})) as { profile?: ClientProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Não foi possível salvar os dados do cliente.");
      const profile = { companyName: payload.profile.companyName, links: payload.profile.links };
      setCompanyName(profile.companyName);
      setLinks(profile.links);
      setSavedProfile(profile);
      setFeedback("Dados do cliente salvos.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar os dados do cliente.");
    } finally {
      setSaving(false);
    }
  }

  function updateLink(index: number, value: string) {
    setLinks((current) => current.map((link, linkIndex) => linkIndex === index ? value : link));
    setFeedback(null);
    setError(null);
  }

  return (
    <section className={styles.card} aria-labelledby="client-settings-title">
      <h3 id="client-settings-title">Cliente</h3>
      <p>Cadastre a empresa do cliente e os links importantes usados durante o atendimento.</p>
      {loading ? (
        <p role="status" className={styles.hint}>Carregando dados…</p>
      ) : (
        <form className={styles.clientForm} onSubmit={(event) => void saveClientProfile(event)}>
          <label className={styles.field}>
            <span>Nome da empresa</span>
            <input
              type="text"
              value={companyName}
              onChange={(event) => {
                setCompanyName(event.target.value);
                setFeedback(null);
                setError(null);
              }}
              placeholder="Ex.: Cotrim Tecnologia"
              autoComplete="organization"
              maxLength={191}
              required
              disabled={saving}
            />
          </label>

          <div className={styles.clientLinks}>
            <div className={styles.clientLinksHeader}>
              <div>
                <strong>Links</strong>
                <span>Sites, documentos ou páginas importantes.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (links.length >= 20) return;
                  setLinks((current) => [...current, ""]);
                  setFeedback(null);
                }}
                disabled={saving || links.length >= 20}
                aria-label="Adicionar link"
                title="Adicionar link"
                className={styles.addLinkButton}
              >
                <Plus size={17} strokeWidth={2} aria-hidden="true" />
                Adicionar link
              </button>
            </div>

            {links.length === 0 ? (
              <p className={styles.emptyLinks}>Nenhum link adicionado.</p>
            ) : (
              <div className={styles.linkList}>
                {links.map((link, index) => (
                  <div key={index} className={styles.linkRow}>
                    <span aria-hidden="true" className={styles.linkIcon}><Link2 size={17} strokeWidth={1.8} /></span>
                    <input
                      type="url"
                      value={link}
                      onChange={(event) => updateLink(index, event.target.value)}
                      placeholder="https://exemplo.com"
                      aria-label={`Link ${index + 1}`}
                      maxLength={2048}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setLinks((current) => current.filter((_, linkIndex) => linkIndex !== index));
                        setFeedback(null);
                        setError(null);
                      }}
                      disabled={saving}
                      aria-label={`Remover link ${index + 1}`}
                      title="Remover link"
                      className={styles.removeLinkButton}
                    >
                      <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {changed && (
            <button type="submit" className={styles.primaryButton} disabled={saving || !companyName.trim()}>
              {saving ? "Salvando…" : "Salvar dados"}
            </button>
          )}
          {feedback && <p role="status" className={styles.feedback}>{feedback}</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </form>
      )}
    </section>
  );
}

void LegacyClientSettings;

type SavedClient = {
  id: string;
  name: string;
  image: string | null;
  links: string[];
  canDelete?: boolean;
};

type ClientDraft = Omit<SavedClient, "id" | "canDelete">;

function ClientSettings() {
  const reduceMotion = useReducedMotion();
  const [celebration, setCelebration] = useState(0);
  const [celebrationClientId, setCelebrationClientId] = useState<string | null>(null);
  const [celebrationOrigin, setCelebrationOrigin] = useState<{ x: number; y: number } | null>(null);
  const celebrationIcon = useRef<HTMLSpanElement>(null);
  const finishCelebration = useCallback(() => {
    setCelebration(0);
    setCelebrationClientId(null);
    setCelebrationOrigin(null);
  }, []);
  const [clients, setClients] = useState<SavedClient[]>([]);
  const [draft, setDraft] = useState<ClientDraft | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const busy = saving || deleting;
  const editingClient = clients.find((client) => client.id === editingClientId);
  const normalizedClientQuery = clientQuery.trim().toLocaleLowerCase("pt-BR");
  const filteredClients = normalizedClientQuery
    ? clients.filter((client) => client.name.toLocaleLowerCase("pt-BR").includes(normalizedClientQuery)
      || client.links.some((link) => link.toLocaleLowerCase("pt-BR").includes(normalizedClientQuery)))
    : clients;

  useEffect(() => {
    const controller = new AbortController();
    async function loadClients() {
      try {
        const response = await fetch(`${API_URL}/clients`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as { clients?: SavedClient[]; error?: string };
        if (!response.ok || !Array.isArray(payload.clients)) {
          throw new Error(payload.error || "Não foi possível carregar os clientes.");
        }
        if (!controller.signal.aborted) setClients(payload.clients);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadClients();
    return () => controller.abort();
  }, []);

  function startClientRegistration() {
    setDraft({ name: "", image: null, links: [] });
    setEditingClientId(null);
    setImageUrl("");
    setFeedback(null);
    setError(null);
  }

  function openClient(client: SavedClient) {
    setDraft({ name: client.name, image: client.image, links: [...client.links] });
    setEditingClientId(client.id);
    setImageUrl(client.image?.startsWith("http://") || client.image?.startsWith("https://") ? client.image : "");
    setFeedback(null);
    setError(null);
  }

  async function selectClientImage(file: File | undefined) {
    if (!file || !draft) return;
    setProcessingImage(true);
    setError(null);
    try {
      const image = await prepareAvatar(file);
      setDraft((current) => current ? { ...current, image } : current);
      setImageUrl("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a imagem.");
    } finally {
      setProcessingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(editingClientId ? `${API_URL}/clients/${encodeURIComponent(editingClientId)}` : `${API_URL}/clients`, {
        method: editingClientId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          image: draft.image,
          links: draft.links.map((link) => link.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { client?: SavedClient; error?: string };
      if (!response.ok || !payload.client) {
        throw new Error(payload.error || "Não foi possível cadastrar o cliente.");
      }
      setClients((current) => editingClientId
        ? current.map((client) => client.id === editingClientId ? payload.client! : client)
        : [payload.client!, ...current]);
      setDraft(null);
      setEditingClientId(null);
      setFeedback(editingClientId ? "Informações atualizadas com sucesso." : null);
      if (!editingClientId) {
        setClientQuery("");
        if (!reduceMotion) {
          setCelebrationOrigin(null);
          setCelebrationClientId(payload.client.id);
          setCelebration((current) => current + 1);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient() {
    if (!editingClient || busy || processingImage) return;
    const client = editingClient;
    setConfirmingDelete(false);
    setDeleting(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`${API_URL}/clients/${encodeURIComponent(client.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Não foi possível excluir o cliente.");
      }
      setClients((current) => current.filter((item) => item.id !== client.id));
      setDraft(null);
      setEditingClientId(null);
      setImageUrl("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o cliente.");
    } finally {
      setDeleting(false);
    }
  }

  function updateDraftLink(index: number, value: string) {
    setDraft((current) => current ? {
      ...current,
      links: current.links.map((link, linkIndex) => linkIndex === index ? value : link),
    } : current);
    setFeedback(null);
    setError(null);
  }

  return (
    <section className={styles.card} aria-label="Clientes">
      {celebration > 0 && celebrationOrigin && <SuccessConfetti key={celebration} origin={celebrationOrigin} onComplete={finishCelebration} />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={draft ? "client-form" : "client-list"}
          initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99, pointerEvents: "none" }}
          transition={reduceMotion ? { duration: 0 } : { ...settingsSpring, opacity: { duration: 0.16 } }}
          onAnimationComplete={() => {
            if (draft || !celebration || celebrationOrigin || !celebrationIcon.current) return;
            const bounds = celebrationIcon.current.getBoundingClientRect();
            setCelebrationOrigin({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
          }}
        >
          {!draft && (
            <div className={styles.clientSectionHeader}>
              {(loading || clients.length > 0) && (
                <label className={styles.clientSearch}>
                  <Search size={17} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    type="search"
                    disabled={loading}
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder="Pesquisar cliente ou link"
                    aria-label="Pesquisar clientes"
                  />
                  {clientQuery && (
                    <button type="button" onClick={() => setClientQuery("")} aria-label="Limpar pesquisa" title="Limpar pesquisa">
                      <X size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  )}
                </label>
              )}
              <motion.button disabled={loading} whileHover={reduceMotion ? undefined : { scale: 1.04 }} whileTap={reduceMotion ? undefined : { scale: 0.94 }} transition={settingsSpring} type="button" className={styles.newClientButton} onClick={startClientRegistration} aria-label="Novo cliente" title="Novo cliente">
                <Plus size={17} strokeWidth={2} aria-hidden="true" />
              </motion.button>
            </div>
          )}

          {loading ? (
            <div className={styles.clientGrid} role="status" aria-label="Carregando clientes" aria-busy="true">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className={styles.clientSkeletonSlot} aria-hidden="true">
                  <span className={styles.clientSkeleton} />
                </div>
              ))}
            </div>
          ) : draft ? (
            <form className={styles.clientForm} onSubmit={(event) => void saveClient(event)}>
              <label className={styles.field}>
                <span>Nome da empresa</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
                  placeholder="Ex.: Cotrim Tecnologia"
                  autoComplete="organization"
                  maxLength={191}
                  required
                  disabled={busy}
                />
              </label>

              <div className={styles.clientMediaSection}>
                <div className={styles.clientDraftHeader}>
                  <div className={styles.clientAvatar} aria-hidden="true">
                    {draft.image ? <Image src={draft.image} alt="" width={64} height={64} unoptimized /> : <Building2 size={26} strokeWidth={1.6} />}
                  </div>
                  <div className={styles.clientPhotoActions}>
                    <strong>Logo da empresa</strong>
                    <span>JPG, PNG ou WebP de até 5 MB.</span>
                    <div>
                      <button type="button" onClick={() => imageInputRef.current?.click()} disabled={processingImage || busy}>
                        <Camera size={15} strokeWidth={1.8} aria-hidden="true" />
                        {processingImage ? "Processando…" : draft.image ? "Trocar imagem" : "Escolher imagem"}
                      </button>
                      {draft.image && (
                        <button type="button" onClick={() => {
                          setDraft((current) => current ? { ...current, image: null } : current);
                          setImageUrl("");
                        }} disabled={busy}>
                          Remover
                        </button>
                      )}
                    </div>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(event) => void selectClientImage(event.target.files?.[0])}
                    />
                  </div>
                </div>

                <label className={`${styles.field} ${styles.clientImageUrl}`}>
                  <span>URL da imagem</span>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      setImageUrl(value);
                      setDraft((current) => current ? {
                        ...current,
                        image: /^https?:\/\//i.test(value.trim()) ? value.trim() : null,
                      } : current);
                      setError(null);
                    }}
                    placeholder="https://exemplo.com/logo.png"
                    maxLength={2048}
                    disabled={busy || processingImage}
                  />
                </label>
              </div>

              <div className={styles.clientLinks}>
                <div className={styles.clientLinksHeader}>
                  <div>
                    <strong>Links</strong>
                    <span>Sites, documentos ou páginas importantes.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => current && current.links.length < 20
                      ? { ...current, links: [...current.links, ""] }
                      : current)}
                    disabled={busy || draft.links.length >= 20}
                    className={styles.addLinkButton}
                  >
                    <Plus size={17} strokeWidth={2} aria-hidden="true" />
                    Adicionar link
                  </button>
                </div>

                {draft.links.length === 0 ? (
                  <button
                    type="button"
                    className={styles.emptyLinks}
                    disabled={busy}
                    onClick={() => setDraft((current) => current ? { ...current, links: [""] } : current)}
                  >
                    <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
                    Adicione o primeiro link da empresa
                  </button>
                ) : (
                  <div className={styles.linkList}>
                    {draft.links.map((link, index) => (
                      <div key={index} className={styles.linkRow}>
                        <span aria-hidden="true" className={styles.linkIcon}><Link2 size={17} strokeWidth={1.8} /></span>
                        <input
                          type="url"
                          value={link}
                          onChange={(event) => updateDraftLink(index, event.target.value)}
                          placeholder="https://exemplo.com"
                          aria-label={`Link ${index + 1}`}
                          maxLength={2048}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => setDraft((current) => current ? {
                            ...current,
                            links: current.links.filter((_, linkIndex) => linkIndex !== index),
                          } : current)}
                          disabled={busy}
                          aria-label={`Remover link ${index + 1}`}
                          title="Remover link"
                          className={styles.removeLinkButton}
                        >
                          <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.clientFormActions}>
                {editingClientId && (
                  <button
                    type="button"
                    className={styles.deleteClientButton}
                    onClick={() => setConfirmingDelete(true)}
                    disabled={busy || processingImage}
                    title="Excluir cliente"
                    aria-busy={deleting}
                  >
                    <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
                    {deleting ? "Excluindo…" : "Excluir cliente"}
                  </button>
                )}
                <button type="button" className={styles.cancelClientButton} onClick={() => {
                  setDraft(null);
                  setEditingClientId(null);
                  setImageUrl("");
                }} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className={styles.primaryButton} disabled={busy || processingImage || !draft.name.trim()}>
                  {saving ? "Salvando…" : editingClientId ? "Salvar alterações" : "Cadastrar cliente"}
                </button>
              </div>
            </form>
          ) : clients.length === 0 ? (
            <button type="button" className={styles.emptyClients} onClick={startClientRegistration}>
              <span><Plus size={20} strokeWidth={1.8} aria-hidden="true" /></span>
              <strong>Cadastre seu primeiro cliente</strong>
              <small>Adicione uma imagem, o nome e os links importantes.</small>
            </button>
          ) : filteredClients.length === 0 ? (
            <div className={styles.noClientResults}>
              <Search size={20} strokeWidth={1.7} aria-hidden="true" />
              <strong>Nenhum cliente encontrado</strong>
              <span>Tente pesquisar por outro nome ou link.</span>
            </div>
          ) : (
            <div className={styles.clientGrid}>
              {filteredClients.map((client, index) => (
                <motion.button
                  layout={reduceMotion ? false : "position"}
                  initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: reduceMotion ? { duration: 0 } : { ...settingsSpring, delay: Math.min(index, 7) * 0.045 } }}
                  whileHover={reduceMotion ? undefined : { y: -2, scale: 1.025 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                  transition={reduceMotion ? { duration: 0 } : settingsSpring}
                  key={client.id}
                  type="button"
                  className={styles.clientLogoButton}
                  onClick={() => openClient(client)}
                  aria-label={`Ver e editar informações de ${client.name}`}
                  title={client.name}
                >
                  <span ref={client.id === celebrationClientId ? celebrationIcon : undefined} className={styles.clientAvatar} aria-hidden="true">
                    {client.image ? <Image src={client.image} alt="" width={64} height={64} unoptimized /> : <Building2 size={25} strokeWidth={1.6} />}
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {feedback && <p role="status" className={styles.feedback}>{feedback}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}

      <Dialog.Root
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!deleting) setConfirmingDelete(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop forceRender className={styles.confirmDeleteBackdrop} />
          <Dialog.Popup className={styles.confirmDeleteDialog}>
            <span className={styles.confirmDeleteIcon} aria-hidden="true">
              <Trash2 size={20} strokeWidth={1.8} />
            </span>
            <Dialog.Title className={styles.confirmDeleteTitle}>Excluir cliente?</Dialog.Title>
            <Dialog.Description className={styles.confirmDeleteDescription}>
              {editingClient?.name}
            </Dialog.Description>
            <div className={styles.confirmDeleteActions}>
              <button type="button" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
              <button type="button" className={styles.confirmDeleteButton} onClick={() => void deleteClient()} autoFocus>
                Excluir
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
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
        {permission === "default" && <button type="button" className={styles.primaryButton} onClick={() => void enableDesktop()}>Ativar notificações</button>}
        {permission === "granted" && (
          <div className={styles.notificationActions}>
            <span className={styles.notificationStatus}><Check size={15} aria-hidden="true" />Ativadas</span>
            <button type="button" className={styles.testNotificationButton} onClick={sendTest}>Enviar teste</button>
          </div>
        )}
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
