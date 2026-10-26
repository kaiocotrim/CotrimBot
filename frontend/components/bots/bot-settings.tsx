"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronDown, LoaderCircle, Power, Save, Settings2 } from "lucide-react";
import type { BotFlow } from "@/lib/bot-api";
import styles from "./bot-settings.module.css";

const guide = [
  { title: "O que cada campo faz?", text: "O nome identifica seu bot na Central. A resposta para opção inválida orienta quem envia uma escolha não reconhecida. O texto do comando 0 é o rótulo de retorno exibido junto às opções do menu." },
  { title: "Salvar ou publicar?", text: "Salvar rascunho guarda suas alterações sem mudar o atendimento em produção. Na aba Fluxo, use Testar bot para revisar a conversa. Quando estiver tudo pronto, clique em Publicar no topo da página." },
  { title: "Como ativar o atendimento?", text: "Depois de publicar, clique em Ativar para usar este bot na instância conectada à empresa. Só um bot pode estar ativo por instância. Para pausar a automação, use Desativar." },
] as const;

export function BotSettingsPanel({ name, flow, dirty, busy, canActivate, hasBot, active, instanceAvailable, onNameChange, onChange, onSave, onActivate }: {
  name: string; flow: BotFlow; dirty: boolean; busy: boolean; canActivate: boolean;
  hasBot: boolean; active: boolean; instanceAvailable: boolean;
  onNameChange: (name: string) => void; onChange: (flow: BotFlow) => void;
  onSave: () => void; onActivate: () => void;
}) {
  const reduced = useReducedMotion();
  const id = useId();
  const [openGuide, setOpenGuide] = useState<number | null>(0);
  const entrance = (delay = 0) => ({
    initial: reduced ? false as const : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : .28, delay: reduced ? 0 : delay },
  });
  const feedback = { whileHover: reduced ? undefined : { y: -1 }, whileTap: reduced ? undefined : { scale: .98 } };

  return <section className={styles.page} aria-labelledby={`${id}-title`}>
    <motion.header {...entrance()} className={styles.heading}>
      <span className={styles.icon}><Settings2 size={20} /></span>
      <div><h1 id={`${id}-title`}>Configurações do bot</h1><p>Pequenos ajustes para uma conversa mais clara.</p></div>
    </motion.header>
    <div className={styles.layout}>
      <motion.form {...entrance(.04)} className={styles.form} onSubmit={event => { event.preventDefault(); onSave(); }}>
        <div className={styles.formHeading}><h2>Preferências de atendimento</h2><span className={styles.status}>{dirty ? "Alterações não salvas" : hasBot ? "Tudo salvo" : "Novo rascunho"}</span></div>
        <label htmlFor={`${id}-name`}>Nome do bot</label>
        <p className={styles.hint} id={`${id}-name-help`}>Como ele aparece na sua Central de Bots.</p>
        <input id={`${id}-name`} aria-describedby={`${id}-name-help`} maxLength={100} value={name} onChange={event => onNameChange(event.target.value)} required />
        <div className={styles.divider} />
        <label htmlFor={`${id}-invalid`}>Resposta para opção inválida</label>
        <p className={styles.hint} id={`${id}-invalid-help`}>Oriente o cliente quando a escolha não existir no menu.</p>
        <textarea id={`${id}-invalid`} aria-describedby={`${id}-invalid-help`} rows={3} maxLength={1000} value={flow.invalidMessage} onChange={event => onChange({ ...flow, invalidMessage: event.target.value })} />
        <span className={styles.counter}>{flow.invalidMessage.length}/1000</span>
        <label htmlFor={`${id}-back`}>Texto do comando 0</label>
        <p className={styles.hint} id={`${id}-back-help`}>Rótulo da opção que permite voltar na conversa.</p>
        <input id={`${id}-back`} aria-describedby={`${id}-back-help`} maxLength={100} value={flow.backLabel} onChange={event => onChange({ ...flow, backLabel: event.target.value })} />
        <footer className={styles.footer}>
          <p>O rascunho só entra em produção quando você publicar.</p>
          <div className={styles.actions}>
            <motion.button {...feedback} type="submit" className={styles.primary} disabled={busy || !name.trim()}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />} Salvar rascunho</motion.button>
            {hasBot && <motion.button {...feedback} type="button" className={styles.secondary} disabled={busy || !canActivate} onClick={onActivate}><Power size={14} />{active ? "Desativar" : "Ativar"}</motion.button>}
          </div>
          {!instanceAvailable ? <p className={styles.availability}>Para ativar, conecte uma instância Evolution à empresa.</p> : hasBot && !canActivate ? <p className={styles.availability}>Publique uma versão do bot para liberar a ativação.</p> : null}
        </footer>
      </motion.form>
      <motion.aside {...entrance(.09)} className={styles.guide} aria-labelledby={`${id}-guide`}>
        <div className={styles.guideHeading}><BookOpen size={18} /><h2 id={`${id}-guide`}>Guia rápido</h2></div>
        <p>Do primeiro ajuste ao bot em produção.</p>
        {guide.map((item, index) => <div className={styles.guideItem} key={item.title}>
          <button type="button" aria-expanded={openGuide === index} aria-controls={`${id}-guide-${index}`} onClick={() => setOpenGuide(openGuide === index ? null : index)}>
            <span>{item.title}</span><motion.span className={styles.chevron} animate={{ rotate: openGuide === index ? 180 : 0 }} transition={{ duration: reduced ? 0 : .2 }}><ChevronDown size={14} /></motion.span>
          </button>
          <AnimatePresence initial={false}>{openGuide === index && <motion.div id={`${id}-guide-${index}`} initial={{ height: reduced ? "auto" : 0, opacity: reduced ? 1 : 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: reduced ? "auto" : 0, opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} className={styles.answer}><p>{item.text}</p></motion.div>}</AnimatePresence>
        </div>)}
        <div className={styles.tip}><span>Uma dica</span><p>Use mensagens curtas e indique ao cliente qual opção escolher em seguida.</p></div>
      </motion.aside>
    </div>
  </section>;
}
