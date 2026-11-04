import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Contact, ContactAssignee } from '../lib/types';
import { useAccount } from '../lib/session';
import { Avatar, Button, colors, ErrorNotice, Icon, ui } from './ui';

const priorities = [
  { value: 'LOW', label: 'Baixa', color: '#22c55e' },
  { value: 'MEDIUM', label: 'Média', color: '#facc15' },
  { value: 'HIGH', label: 'Alta', color: '#ef4444' },
] as const;

export function ContactActions({ contact, onChange }: { contact: Contact; onChange: (updated: Contact) => void }) {
  const { account } = useAccount();
  const [users, setUsers] = useState<ContactAssignee[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [retry, setRetry] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<'assignment' | 'priority' | 'close' | null>(null);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const assignedIds = contact.assignedUserIds ?? [];
  const selected = assignedIds.map(id => users.find(user => user.id === id) ?? { id, name: 'Responsável', image: null });

  useEffect(() => {
    if (!account || contact.isGroup) return;
    let active = true;
    void account.api.assignees().then(result => { if (active) { setUsers(result); setUsersError(''); } })
      .catch(failure => { if (active) setUsersError(failure.message || 'Não foi possível carregar os responsáveis.'); })
      .finally(() => { if (active) setUsersLoading(false); });
    return () => { active = false; };
  }, [account, contact.isGroup, retry]);

  async function change(kind: 'assignment' | 'priority' | 'close', value?: string[] | NonNullable<Contact['priority']>) {
    if (!account || lock.current) return;
    lock.current = true; setPending(kind); setError('');
    try {
      const updated = kind === 'assignment' ? await account.api.setAssignment(contact.id, value as string[])
        : kind === 'priority' ? await account.api.setPriority(contact.id, value as NonNullable<Contact['priority']>)
          : (await account.api.closeConversation(contact.id)).contact;
      onChange(updated);
      if (kind === 'close') Alert.alert('Chamado encerrado', 'A pesquisa de satisfação foi enviada e os responsáveis foram removidos.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { setPending(null); lock.current = false; }
  }

  return <View style={styles.root}>
    {!contact.isGroup && <View style={styles.section}>
      <Text style={ui.muted}>Responsáveis</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Responsáveis: ${selected.map(user => user.name).join(', ') || 'Não atribuído'}`} accessibilityState={{ expanded: pickerOpen }} disabled={usersLoading || !!usersError || !!pending} onPress={() => setPickerOpen(value => !value)} style={styles.selector}>
        {selected.slice(0, 3).map(user => <Avatar key={user.id} name={user.name} uri={user.image} size={28} />)}
        {!selected.length && <Icon name="user" size={20} color={colors.muted} />}
        <Text numberOfLines={1} style={styles.selectorLabel}>{usersLoading ? 'Carregando usuários...' : selected.map(user => user.name).join(', ') || 'Não atribuído'}</Text>
        {pending === 'assignment' ? <ActivityIndicator color={colors.muted} /> : <Icon name="chevron" size={16} color={colors.muted} />}
      </Pressable>
      {pickerOpen && <View style={styles.picker}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: assignedIds.length === 0 }} disabled={!!pending} style={styles.option} onPress={() => void change('assignment', [])}><Icon name="user" size={20} color={colors.muted} /><Text style={styles.selectorLabel}>Não atribuído</Text><Text style={ui.text}>{!assignedIds.length ? '✓' : ''}</Text></Pressable>
        {users.map(user => <Pressable key={user.id} accessibilityRole="checkbox" accessibilityLabel={user.name} accessibilityState={{ checked: assignedIds.includes(user.id) }} disabled={!!pending} style={styles.option} onPress={() => void change('assignment', assignedIds.includes(user.id) ? assignedIds.filter(id => id !== user.id) : [...assignedIds, user.id])}>
          <Avatar name={user.name} uri={user.image} size={28} /><Text style={styles.selectorLabel}>{user.name}</Text><Text style={ui.text}>{assignedIds.includes(user.id) ? '✓' : ''}</Text>
        </Pressable>)}
      </View>}
      <ErrorNotice message={usersError} />
      {!!usersError && <Button label="Recarregar responsáveis" secondary onPress={() => { setUsersLoading(true); setUsersError(''); setRetry(value => value + 1); }} />}
    </View>}
    <View style={styles.section}><Text style={ui.muted}>Prioridade</Text>
      <View style={styles.priorities}>{priorities.map(option => {
        const selected = contact.priority === option.value;
        return <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`Prioridade ${option.label.toLowerCase()}`} accessibilityState={{ selected }} disabled={!!pending} onPress={() => void change('priority', selected ? 'NONE' : option.value)} style={[styles.priority, selected && styles.activePriority]}>
          <View style={[styles.dot, { backgroundColor: option.color, opacity: selected ? 1 : .45 }]} /><Text style={{ color: selected ? option.color : colors.muted, fontSize: 13, fontWeight: '500' }}>{option.label}</Text>
        </Pressable>;
      })}</View>
      {pending === 'priority' && <Text style={styles.hint}>Salvando prioridade...</Text>}
    </View>
    <View style={styles.section}><Text style={ui.muted}>Status</Text><Text style={styles.status}>{contact.archived ? 'Arquivado' : 'Ativo'}</Text></View>
    <ErrorNotice message={error} />
    {!contact.isGroup && <Button label={pending === 'close' ? 'Encerrando chamado...' : 'Encerrar chamado'} style={styles.action} secondary busy={pending === 'close'} disabled={!!pending} onPress={() => Alert.alert('Encerrar chamado?', 'A pesquisa de satisfação será enviada ao contato e os responsáveis serão removidos.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Encerrar chamado', onPress: () => void change('close') }])} />}
    <View style={{ marginTop: 8 }}><Button label="Localizar mensagem nesta conversa" style={styles.action} secondary disabled={!!pending} onPress={() => router.dismissTo({ pathname: '/chat/[id]', params: { id: String(contact.id), name: contact.name, phone: contact.phone, photo: contact.profilePictureUrl ?? '', group: contact.isGroup ? '1' : '0', search: '1' } })} /></View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 24 }, section: { gap: 8 }, action: { borderRadius: 14, borderWidth: 0 }, selector: { flexDirection: 'row', alignItems: 'center', minHeight: 48, padding: 10, gap: 8, borderRadius: 14, backgroundColor: '#141416' },
  selectorLabel: { flex: 1, color: colors.text, fontSize: 14 }, picker: { borderRadius: 16, padding: 6, backgroundColor: '#18181b', borderWidth: 1, borderColor: colors.border }, option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  priorities: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: '#101012' }, priority: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 10, gap: 5 }, activePriority: { backgroundColor: '#27272a' }, dot: { width: 6, height: 6, borderRadius: 3 },
  status: { color: colors.text, fontSize: 16, fontWeight: '500' }, hint: { color: colors.muted, fontSize: 12 },
});
