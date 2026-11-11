"use client";

import type { BotFlow } from "@/lib/bot-api";
import { BotSelect } from "./bot-select";
import styles from "./bot-settings.module.css";

export function BotSacTicketSettings({ flow, onChange }: {
  flow: BotFlow;
  onChange: (flow: BotFlow) => void;
}) {
  const handoff = flow.sacTicketHandoff ?? "UNASSIGNED";
  return <fieldset className={styles.lookup}>
    <legend>Após abrir o chamado no SAC</legend>
    <p className={styles.hint}>Escolha quem ficará responsável depois que o Bot confirmar a abertura e enviar o protocolo ao cliente.</p>
    <BotSelect
      label="Destino após abertura do chamado"
      value={handoff}
      options={[
        { value: "UNASSIGNED", label: "Não atribuído (fila)" },
        { value: "BOT", label: "Continuar com o Bot" },
      ]}
      onChange={value => onChange({ ...flow, sacTicketHandoff: value as NonNullable<BotFlow["sacTicketHandoff"]> })}
    />
  </fieldset>;
}
