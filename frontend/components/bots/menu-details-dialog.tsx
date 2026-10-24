"use client";

import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronRight, ListTree, MessageSquare, X } from "lucide-react";
import { MessageText } from "@/components/chat/message-text";
import { botImageUrl, type BotFlow, type BotMenu } from "@/lib/bot-api";
import styles from "./bot-designer.module.css";

type MenuDetailsProps = {
  menu: BotMenu | undefined;
  flow: BotFlow;
  path: string | undefined;
  onClose: () => void;
  onEdit: (menuId: string, optionId?: string) => void;
  onNavigate: (menuId: string) => void;
};

export function MenuDetailsDialog(props: MenuDetailsProps) {
  return <AnimatePresence>{props.menu && <MenuDetailsContent key="menu-details" {...props} menu={props.menu} />}</AnimatePresence>;
}

function MenuDetailsContent({ menu, flow, path, onClose, onEdit, onNavigate }: MenuDetailsProps & { menu: BotMenu }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const transition = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 300, damping: 32, mass: .8 };
  const entries = menu ? flow.menus.flatMap(parent => parent.options
    .filter(option => option.action === "SUBMENU" && option.targetMenuId === menu.id)
    .map(option => ({ parent, option }))) : [];
  const isRoot = menu?.id === flow.rootMenuId;
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className={styles.menuDialogBackdrop} render={<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} />} />
      <div className={styles.menuDialogPositioner}>
      <Dialog.Popup className={styles.menuDialog} aria-hidden={!present || undefined} style={{ pointerEvents: present ? "auto" : "none" }} render={<motion.div
        initial={reduced ? false : { opacity: 0, y: 14, scale: .975 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduced ? 0 : 8, scale: reduced ? 1 : .985 }} transition={{ ...transition, opacity: { duration: reduced ? 0 : .18 } }}
      />}>
        {menu && <>
          <header className={styles.menuDialogHeader}>
            <span className={styles.menuDialogIcon}><ListTree size={22} /></span>
            <div><span className={styles.menuDialogEyebrow}>{isRoot ? "Menu principal" : "Menu de opções"}</span><Dialog.Title>{menu.name}</Dialog.Title></div>
            <Dialog.Close className={styles.menuDialogClose} aria-label="Fechar informações do menu"><X size={18} /></Dialog.Close>
          </header>
          <Dialog.Description className={styles.menuDialogDescription}>Veja o que o cliente recebe e para onde cada opção leva.</Dialog.Description>
          <div className={styles.menuDialogBody}>
            <div className={styles.menuDialogPath} aria-label="Caminho do menu">{path ?? "Este menu ainda não está ligado ao menu principal."}</div>
            <div className={styles.menuDialogBadges}>
              <span>{menu.options.length} {menu.options.length === 1 ? "opção" : "opções"}</span>
              <span>{menu.options.filter(option => option.active).length} {menu.options.filter(option => option.active).length === 1 ? "ativa" : "ativas"}</span>
              {!isRoot && !path && <span>Sem conexão</span>}
            </div>
            <section className={styles.menuDialogSection}>
              <h3>Como o cliente chega aqui</h3>
              {isRoot ? <p>Este é o primeiro menu mostrado ao iniciar o atendimento.</p> : entries.length ? entries.map(({ parent, option }) => <p key={`${parent.id}:${option.id}`}>No menu <strong>{parent.name}</strong>, o cliente escolhe <strong>{option.number} — {option.label}</strong>{!option.active ? " (opção inativa)" : ""}.</p>) : <p>Conecte uma opção de outro menu a este para o cliente conseguir acessá-lo.</p>}
            </section>
            <section className={styles.menuDialogSection}>
              <h3><MessageSquare size={14} /> Mensagem enviada</h3>
              <div className={styles.menuDialogMessage}>
                {menu.imageId && <Image src={botImageUrl(menu.imageId)} alt="Imagem enviada neste menu" width={480} height={240} unoptimized className={styles.imagePreview} />}
                {menu.text ? <MessageText content={menu.text} /> : <p>{menu.imageId ? "Este menu envia uma imagem sem legenda." : "A mensagem deste menu ainda não foi preenchida."}</p>}
              </div>
            </section>
            <section className={styles.menuDialogSection}>
              <h3>Opções deste menu</h3>
              {menu.options.length ? <ul className={styles.menuDialogOptions}>{menu.options.map(option => {
                const target = option.action === "SUBMENU" ? flow.menus.find(item => item.id === option.targetMenuId) : undefined;
                const action = option.action === "SAC_TEST" ? "Coleta dados e salva um chamado de teste no CotrimBot, sem abrir chamado no SAC" : option.action === "SUBMENU" ? target ? `Abre o menu ${target.name}` : "Menu de destino não definido" : option.action === "CLOSE" ? "Encerra o atendimento" : option.action === "HUMAN" ? "Transfere para um atendente" : option.action === "IMAGE" || option.imageId ? "Envia uma imagem e a resposta cadastrada" : "Envia a resposta cadastrada";
                return <li key={option.id}>
                  <span className={styles.menuDialogNumber}>{option.number}</span>
                  <div><strong>{option.label || "Opção sem nome"}</strong>{option.description && <p>{option.description}</p>}<p>{action}</p>{!option.active && <span className={styles.menuDialogInactive}>Inativa · não aparece para o cliente</span>}</div>
                  <button aria-label={target ? `Ver menu ${target.name}` : `Editar opção ${option.number}: ${option.label}`} onClick={() => target ? onNavigate(target.id) : onEdit(menu.id, option.id)}><ChevronRight size={17} /></button>
                </li>;
              })}</ul> : <p>Nenhuma opção cadastrada. Abra a edição para adicionar as escolhas do cliente.</p>}
            </section>
          </div>
          <footer className={styles.menuDialogFooter}>
            <Dialog.Close className={styles.button}>Fechar</Dialog.Close>
            <button className={styles.primary} onClick={() => onEdit(menu.id)}>Editar menu <ArrowRight size={15} /></button>
          </footer>
        </>}
      </Dialog.Popup>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
