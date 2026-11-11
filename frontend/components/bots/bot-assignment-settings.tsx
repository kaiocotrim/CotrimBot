"use client";

import type { BotFlow, BotMember } from "@/lib/bot-api";
import { BotSelect } from "./bot-select";
import styles from "./bot-settings.module.css";

type Props = { flow: BotFlow; members: BotMember[]; onChange: (flow: BotFlow) => void };

export function BotAssignmentSettings({ flow, members, onChange }: Props) {
  const assignment = flow.assignment ?? {};
  const update = (key: keyof NonNullable<BotFlow["assignment"]>, value: string) =>
    onChange({ ...flow, assignment: { ...assignment, [key]: value } });
  const options = [{ value: "", label: "Não atribuído" }, ...members.map(member => ({ value: member.userId, label: member.name }))];
  return <fieldset className={styles.lookup}>
    <legend>Atribuições automáticas</legend>
    <p className={styles.hint}>Defina o responsável de cada etapa. Salve o rascunho e publique para aplicar.</p>
    <BotSelect label="Ao criar contato" value={assignment.onContactCreateUserId ?? ""} options={options}
      onChange={value => update("onContactCreateUserId", value)} />
    <p className={styles.hint}>Usado quando um contato é salvo na agenda.</p>
    <BotSelect label="Ao abrir chamado" value={assignment.onTicketOpenUserId ?? ""} options={options}
      onChange={value => update("onTicketOpenUserId", value)} />
    <p className={styles.hint}>O padrão é deixar o chamado na fila sem responsável.</p>
    <BotSelect label="Ao encerrar chamado" value={assignment.onCloseUserId ?? ""} options={options}
      onChange={value => update("onCloseUserId", value)} />
    <p className={styles.hint}>Usado pelo botão “Encerrar chamado com o Bot”.</p>
  </fieldset>;
}
