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
  const firstName = (name: string) => name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/)[0];
  const infordocTechnicians = ['Kaio', 'Felype', 'Bruno', 'Thiago'];
  const missing = infordocTechnicians.filter(name => !routing.technicians.some(t => firstName(t.name) === firstName(name)));
  return <fieldset className={styles.lookup}>
    <legend>Consulta de chamados no SAC</legend>
    <p className={styles.hint}>Sem técnico disponível, encaminhar para:</p>
    <BotSelect label="Destino de apoio da consulta" value={routing.fallbackUserId ?? ''}
      options={[{ value: '', label: 'Não atribuído' }, ...options]}
      onChange={fallbackUserId => update({ ...routing, fallbackUserId })} />
    <p className={styles.hint}>Configure o primeiro nome do técnico e escolha o membro que receberá a conversa. Exemplo: Bruno identifica BRUNO ODORISSI CAMPANER no SAC e encaminha para o membro Bruno Campaner que você selecionar. Um vínculo com nome completo tem prioridade. Salve e publique para aplicar.</p>
    <button className={styles.secondary} type="button" disabled={!missing.length || !options.length || routing.technicians.length + missing.length > 200}
      onClick={() => update({ ...routing, technicians: [...routing.technicians, ...missing.map(name => {
        const candidates = options.filter(member => firstName(member.label) === firstName(name));
        return { name, userId: candidates.length === 1 ? candidates[0]!.value : '', available: true };
      })] })}>Preencher Kaio, Felype, Bruno e Thiago</button>
    {routing.technicians.map((technician, index) => <fieldset className={styles.technician} key={index}>
      <legend>Técnico {index + 1}</legend>
      <label>Nome do técnico no SAC<input placeholder="Ex.: Bruno ou BRUNO ODORISSI CAMPANER" maxLength={191} value={technician.name} onChange={event => update({ ...routing,
        technicians: routing.technicians.map((t, i) => i === index ? { ...t, name: event.target.value } : t) })} /></label>
      <label>Membro que receberá o atendimento<BotSelect label={`Membro que receberá o atendimento — técnico ${index + 1}`} value={technician.userId}
        options={[{ value: '', label: 'Selecione um membro' }, ...options]}
        onChange={userId => update({ ...routing, technicians: routing.technicians.map((t, i) => i === index ? { ...t, userId } : t) })} /></label>
      <label className={styles.availabilityChoice}><input type="checkbox" checked={technician.available} onChange={event => update({ ...routing,
        technicians: routing.technicians.map((t, i) => i === index ? { ...t, available: event.target.checked } : t) })} /> Receber transferências</label>
      <button className={styles.secondary} type="button" onClick={() => update({ ...routing, technicians: routing.technicians.filter((_, i) => i !== index) })}>Remover vínculo</button>
    </fieldset>)}
    <button className={styles.secondary} type="button" disabled={!options.length || routing.technicians.length >= 200}
      onClick={() => update({ ...routing, technicians: [...routing.technicians, { name: '', userId: '', available: true }] })}>Adicionar técnico</button>
  </fieldset>;
}
