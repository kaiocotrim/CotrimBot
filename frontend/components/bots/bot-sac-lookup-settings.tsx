"use client";

import type { BotFlow, BotMember } from '@/lib/bot-api';
import { BotSelect } from './bot-select';
import styles from './bot-settings.module.css';

export function BotSacLookupSettings({ flow, members, onChange }: {
  flow: BotFlow; members: BotMember[]; onChange: (flow: BotFlow) => void;
}) {
  const routing = flow.sacLookup ?? { fallbackUserId: '', technicians: [] };
  const options = members.filter(m => m.userId !== flow.assignedUserId).map(m => ({ value: m.userId, label: m.name }));
  const update = (next: typeof routing) => onChange({ ...flow, sacLookup: next });
  return <fieldset className={styles.lookup}>
    <legend>Consulta de chamados no SAC</legend>
    <p className={styles.hint}>Sem técnico disponível, encaminhar para:</p>
    <BotSelect label="Destino de apoio da consulta" value={routing.fallbackUserId ?? ''}
      options={[{ value: '', label: 'Não atribuído' }, ...options]}
      onChange={fallbackUserId => update({ ...routing, fallbackUserId })} />
    <p className={styles.hint}>Vincule o nome exato retornado pelo SAC ao membro responsável. Marque quem pode receber transferências. Salve e publique para aplicar.</p>
    {routing.technicians.map((technician, index) => <fieldset className={styles.technician} key={index}>
      <legend>Técnico {index + 1}</legend>
      <label>Nome do técnico no SAC<input maxLength={191} value={technician.name} onChange={event => update({ ...routing,
        technicians: routing.technicians.map((t, i) => i === index ? { ...t, name: event.target.value } : t) })} /></label>
      <BotSelect label={`Membro do técnico ${index + 1}`} value={technician.userId}
        options={[{ value: '', label: 'Selecione um membro' }, ...options]}
        onChange={userId => update({ ...routing, technicians: routing.technicians.map((t, i) => i === index ? { ...t, userId } : t) })} />
      <label className={styles.availabilityChoice}><input type="checkbox" checked={technician.available} onChange={event => update({ ...routing,
        technicians: routing.technicians.map((t, i) => i === index ? { ...t, available: event.target.checked } : t) })} /> Receber transferências</label>
      <button className={styles.secondary} type="button" onClick={() => update({ ...routing, technicians: routing.technicians.filter((_, i) => i !== index) })}>Remover vínculo</button>
    </fieldset>)}
    <button className={styles.secondary} type="button" disabled={!options.length || routing.technicians.length >= 200}
      onClick={() => update({ ...routing, technicians: [...routing.technicians, { name: '', userId: options[0]?.value ?? '', available: false }] })}>Adicionar técnico</button>
  </fieldset>;
}
