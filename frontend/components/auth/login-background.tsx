"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft, AudioLines, CheckCheck, MessageCircle, MoreVertical,
  Paperclip, Phone, Play, Search, Send, Settings, Smile, Users, Video,
} from "lucide-react";
import styles from "./login-background.module.css";

const CONVERSATION_DURATION = 20_000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const preference = window.matchMedia(REDUCED_MOTION_QUERY);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotion() {
  return false;
}

function useTypewriter(text: string, delay: number) {
  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const [characterCount, setCharacterCount] = useState(-1);
  const characters = Array.from(text);

  useEffect(() => {
    if (reduceMotion) return;

    const startedAt = Date.now();
    const length = Array.from(text).length;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) % CONVERSATION_DURATION;
      const typingTime = elapsed - delay - 600;
      setCharacterCount(elapsed < delay ? -1 : typingTime < 0 ? 0 : Math.min(length, Math.floor(typingTime / 45) + 1));
    }, 80);

    return () => window.clearInterval(timer);
  }, [text, delay, reduceMotion]);

  const count = reduceMotion ? characters.length : characterCount;
  return {
    content: characters.slice(0, Math.max(0, count)).join(""),
    waiting: count < 0,
    typing: count >= 0 && count < characters.length,
  };
}

function TypewriterText({ text, content, typing }: { text: string; content: string; typing: boolean }) {
  return (
    <span className={styles.typewriter}>
      {/* Reserva o espaço final para os cartões não mudarem de tamanho ao digitar. */}
      <span className={styles.textSizer}>{text}</span>
      <span className={styles.typedText}>
        {content || (typing && <span className={styles.typingDots}><i /><i /><i /><span>digitando...</span></span>)}
        {typing && content && <span className={styles.typingCaret} />}
      </span>
    </span>
  );
}

function AnimatedMessage({ text, time, outgoing = false, delay }: { text: string; time: string; outgoing?: boolean; delay: number }) {
  const playback = useTypewriter(text, delay);
  return (
    <p className={`${outgoing ? styles.outgoing : styles.incoming} ${playback.waiting ? styles.pendingMessage : ""}`}>
      <TypewriterText text={text} {...playback} />
      <small className={playback.typing ? styles.pendingMessage : undefined}>{time} {outgoing && <CheckCheck size={15} />}</small>
    </p>
  );
}

function AnimatedTranscript() {
  const text = "Olá! Tenho interesse em contratar o serviço. Poderia me passar os valores e formas de pagamento?";
  const playback = useTypewriter(text, 800);
  return (
    <p>
      <TypewriterText text={text} {...playback} />
    </p>
  );
}

const conversations = [
  { name: "Mariana Oliveira", initials: "MO", message: "Oi! Gostaria de saber mais...", time: "10:24", unread: "2" },
  { name: "Rafael Mendes", initials: "RM", message: "Tem como me enviar o orçamento?", time: "09:18", unread: "1" },
  { name: "Clínica Vida+", initials: "CV", message: "Obrigado pelo retorno!", time: "Ontem", unread: "" },
  { name: "Juliana Costa", initials: "JC", message: "Perfeito, vou aguardar.", time: "Ontem", unread: "" },
  { name: "Lucas Ferreira", initials: "LF", message: "Qual o horário de atendimento?", time: "Seg", unread: "" },
];

function WindowDots() {
  return <div className={styles.dots}><i /><i /><i /></div>;
}

function PreviewHeader({ name, initials }: { name: string; initials: string }) {
  return (
    <div className={styles.chatHeader}>
      <ArrowLeft size={18} />
      <span className={styles.avatar}>{initials}</span>
      <div className={styles.contactName}><strong>{name}</strong><small>online</small></div>
      <Video size={18} /><Phone size={17} /><MoreVertical size={18} />
    </div>
  );
}

function PreviewComposer() {
  return (
    <div className={styles.composer}>
      <span><MessageCircle size={17} />Digite uma mensagem...<Paperclip size={17} /><Smile size={17} /></span>
      <i><Send size={19} /></i>
    </div>
  );
}

function ConversationPreview() {
  return (
    <>
      <WindowDots />
      <div className={styles.conversationLayout}>
        <div className={styles.navigation}>
          <strong>CotrimBot</strong>
          <span className={styles.activeNav}><MessageCircle size={15} />Conversas</span>
          <span><Users size={15} />Contatos</span>
          <span><Send size={15} />Campanhas</span>
          <span><AudioLines size={15} />IA e ferramentas</span>
          <span><Settings size={15} />Configurações</span>
        </div>
        <div className={styles.conversationList}>
          <div className={styles.search}><Search size={14} />Buscar conversas...</div>
          <div className={styles.filters}><span>Todas</span><span>Não lidas</span><span>Clientes</span></div>
          <div className={styles.contactsViewport}>
            <div className={styles.contactsTrack}>
              {/* Grupos iguais mantêm a rolagem contínua na passagem entre ciclos. */}
              {[0, 1].map((copy) => (
                <div key={copy}>
                  {conversations.map((contact) => (
                    <div key={contact.name} className={styles.conversation}>
                      <span className={styles.avatar}>{contact.initials}</span>
                      <div><strong>{contact.name}</strong><small>{contact.message}</small></div>
                      <span className={styles.conversationMeta}><small>{contact.time}</small>{contact.unread && <i>{contact.unread}</i>}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ChatPreview() {
  return (
    <>
      <PreviewHeader name="Mariana Oliveira" initials="MO" />
      <div className={styles.messages}>
        <AnimatedMessage text="Oi! Gostaria de saber mais sobre os planos disponíveis." time="10:24" delay={0} />
        <AnimatedMessage text="Claro! Vou te enviar todas as informações sobre os planos. 😊" time="10:25" outgoing delay={4_000} />
        <AnimatedMessage text="Perfeito, fico no aguardo!" time="10:25" delay={8_500} />
      </div>
      <PreviewComposer />
    </>
  );
}

function AudioPreview() {
  return (
    <>
      <WindowDots />
      <PreviewHeader name="João Pedro" initials="JP" />
      <div className={styles.messages}>
        <div className={styles.audio}>
          <div className={styles.audioPlayer}>
            <i><Play size={18} fill="currentColor" /></i>
            <div><span className={styles.audioTrack} /><small>0:00 <span>0:32</span></small></div>
          </div>
          <div className={styles.transcriptionLabel}><AudioLines size={16} />Transcrever áudio<span>1×</span></div>
          <AnimatedTranscript />
        </div>
        <AnimatedMessage text="Claro! Vou te enviar todas as informações. Qualquer dúvida, estou à disposição!" time="10:16" outgoing delay={6_500} />
      </div>
    </>
  );
}

// Cenários decorativos: não usam dados reais nem fazem chamadas para a API.
export function LoginBackground() {
  return (
    <div aria-hidden="true" className={styles.background}>
      <div className={styles.aurora} />
      <div className={styles.planet} />
      <div className={`${styles.panel} ${styles.topLeft}`}><ConversationPreview /></div>
      <div className={`${styles.panel} ${styles.topRight}`}><AudioPreview /></div>
      <div className={`${styles.panel} ${styles.bottomLeft}`}><ChatPreview /></div>
      <div className={`${styles.panel} ${styles.bottomRight}`}><ConversationPreview /></div>
      <div className={styles.veil} />
    </div>
  );
}
