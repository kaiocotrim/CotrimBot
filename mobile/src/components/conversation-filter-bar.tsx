import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAccount } from '../lib/session';
import type { ContactAssignee } from '../lib/types';
import type { ConversationFilters } from '../lib/conversation-filters';

const options = [
  { key: 'unread', label: 'Não lido' },
  { key: 'favorites', label: 'Favoritos' },
  { key: 'priority', label: 'Prioridade' },
] as const;

export function ConversationFilterBar({ filters, onChange }: {
  filters: ConversationFilters;
  onChange: (filters: ConversationFilters) => void;
}) {
  const { account } = useAccount();
  const [members, setMembers] = useState<ContactAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!account) return;
    let active = true;
    void account.api.assignees().then(result => {
      if (active) { setMembers(result); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account, retry]);

  function chip(key: string, label: string, selected: boolean, onPress: () => void, accessibilityLabel = label) {
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }} onPress={onPress} hitSlop={{ top: 5, bottom: 5 }}
      style={({ pressed }) => [styles.chip, selected && styles.active, pressed && { opacity: .65 }]}>
      <Text style={[styles.label, selected && styles.activeLabel]}>{label}</Text>
    </Pressable>;
  }

  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.row}>
      {options.map(option => chip(option.key, option.label, filters[option.key], () => onChange({ ...filters, [option.key]: !filters[option.key] })))}
      {members.map(member => chip(member.id, member.name, filters.assigneeId === member.id,
        () => onChange({ ...filters, assigneeId: filters.assigneeId === member.id ? null : member.id }), `Atendimentos de ${member.name}`))}
      {loading && <Text style={styles.hint}>Carregando membros…</Text>}
      {failed && chip('retry', 'Recarregar membros', false, () => { setLoading(true); setFailed(false); setRetry(value => value + 1); })}
    </ScrollView>
    {failed && <Text accessibilityRole="alert" style={styles.error}>Não foi possível atualizar os membros.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -18 },
  row: { gap: 8, alignItems: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 5 },
  chip: { flexShrink: 0, minHeight: 34, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#2b2b2d', backgroundColor: '#151516', alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: '#352047', borderColor: '#674080' },
  label: { textAlign: 'center', color: '#a7a7ab', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  activeLabel: { color: '#ead5ff' },
  hint: { color: '#a1a1aa', fontSize: 12 },
  error: { color: '#fda4af', fontSize: 12, paddingTop: 6 },
});
