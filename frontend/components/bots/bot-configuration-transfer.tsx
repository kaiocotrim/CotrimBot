"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRef, useState } from "react";
import { ArrowUp, Download, LoaderCircle, X } from "lucide-react";
import type { BotFlow, BotMember } from "@/lib/bot-api";
import { BOT_CONFIGURATION_MAX_BYTES, botConfigurationFilename, exportBotConfiguration, importBotConfiguration, parseBotConfiguration, type BotConfiguration } from "@/lib/bot-configuration";
import buttons from "./bot-designer.module.css";
import styles from "./bot-configuration-transfer.module.css";

export function BotConfigurationTransfer({ name, flow, members, busy, dirty, onProcessingChange, onImport, onNotice }: {
  name: string; flow: BotFlow; members: BotMember[]; busy: boolean; dirty: boolean;
  onProcessingChange: (processing: boolean) => void;
  onImport: (configuration: { name: string; flow: BotFlow }) => void;
  onNotice: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploadedImages = useRef(new Map<string, string>());
  const [pending, setPending] = useState<BotConfiguration | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  function setWorking(value: boolean) { setProcessing(value); onProcessingChange(value); }

  async function exportFile() {
    setWorking(true);
    try {
      const text = await exportBotConfiguration(name, flow);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = botConfigurationFilename(name);
      document.body.appendChild(link);
      link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotice("Configuração exportada com menus, ações, integrações e imagens do rascunho atual.");
    } catch (cause) { onNotice(cause instanceof Error ? cause.message : "Não foi possível exportar a configuração."); }
    finally { setWorking(false); }
  }

  async function selectFile(file: File) {
    setWorking(true); setError("");
    try {
      if (file.size > BOT_CONFIGURATION_MAX_BYTES) throw new Error("Escolha um arquivo de configuração de até 50 MB.");
      const configuration = parseBotConfiguration(await file.text());
      uploadedImages.current.clear();
      setPending(configuration);
    } catch (cause) { onNotice(cause instanceof Error ? cause.message : "Não foi possível ler a configuração."); }
    finally { setWorking(false); }
  }

  async function confirmImport() {
    if (!pending || processing) return;
    setWorking(true); setError("");
    try {
      const imported = await importBotConfiguration(pending, members, uploadedImages.current);
      onImport({ name: pending.name, flow: imported });
      const assignmentRemoved = Boolean(pending.draft.assignedUserId && !imported.assignedUserId);
      setPending(null);
      onNotice(`Configuração importada no rascunho. Revise e salve antes de publicar.${assignmentRemoved ? " Escolha um membro desta empresa nas configurações do bot." : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível importar a configuração. Seu rascunho foi mantido."); }
    finally { setWorking(false); }
  }

  return <>
    <button type="button" className={buttons.button} disabled={busy || processing || !name.trim()} aria-label="Exportar configuração do bot" title="Exportar configuração do bot" onClick={() => void exportFile()}>
      <Download size={15} /><span className={buttons.headerActionLabel}>Exportar</span>
    </button>
    <button type="button" className={buttons.button} disabled={busy || processing} aria-label="Importar configuração do bot" title="Importar configuração do bot" onClick={() => input.current?.click()}>
      <ArrowUp size={15} /><span className={buttons.headerActionLabel}>Importar</span>
    </button>
    <input ref={input} data-bot-import type="file" accept=".json,application/json" hidden disabled={busy || processing} onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void selectFile(file);
    }} />
    <Dialog.Root open={pending !== null} onOpenChange={open => { if (!open && !processing) setPending(null); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog}>
          <header className={styles.heading}>
            <Dialog.Title>Importar configuração do bot</Dialog.Title>
            <Dialog.Close disabled={processing} className={styles.close} aria-label="Fechar importação"><X size={18} /></Dialog.Close>
          </header>
          <Dialog.Description className={styles.description}>Confira o arquivo antes de substituir o rascunho atual. A versão publicada continua em produção até você publicar novamente.</Dialog.Description>
          {pending && <>
            <strong className={styles.name}>{pending.name}</strong>
            <dl className={styles.summary}>
              <div><dt>Menus</dt><dd>{pending.draft.menus.length}</dd></div>
              <div><dt>Opções</dt><dd>{pending.draft.menus.reduce((count, menu) => count + menu.options.length, 0)}</dd></div>
              <div><dt>Imagens</dt><dd>{pending.images.length}</dd></div>
            </dl>
            <p className={styles.description}>Inclui mensagens, ações, posições dos blocos e preferências{pending.draft.integrations ? ", além da configuração das integrações" : ""}.</p>
            {dirty && <p className={styles.warning}>Há alterações não salvas no rascunho atual. Exporte-as antes de importar se quiser guardar uma cópia.</p>}
            {pending.draft.assignedUserId && !members.some(member => member.userId === pending.draft.assignedUserId) && <p className={styles.warning}>O membro atribuído no arquivo não está nesta empresa. Escolha um membro após a importação.</p>}
          </>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <footer className={styles.actions}>
            <Dialog.Close disabled={processing} className={buttons.button}>Cancelar</Dialog.Close>
            <button type="button" className={buttons.primary} disabled={processing} onClick={() => void confirmImport()}>{processing && <LoaderCircle size={15} className="animate-spin" />}{processing ? "Importando…" : "Importar para o rascunho"}</button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
