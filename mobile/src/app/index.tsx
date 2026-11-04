import { useCallback, useMemo, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, colors, ErrorNotice, Field, Icon, IconButton, ui } from '../components/ui';
import { useAccount } from '../lib/session';
import { connectRealtime } from '../lib/realtime';
import type { Contact } from '../lib/types';

export default function Conversations() {
  const { account, signOut } = useAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'mine' | 'groups' | 'conversations'>('mine');
  const [archived, setArchived] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);

  const refresh = useCallback(async () => {
    if (!account) return;
    try { setContacts(await account.api.contacts()); setError(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as conversas.'); }
    finally { setRefreshing(false); }
  }, [account]);

  function manualRefresh() { setRefreshing(true); void refresh(); }

  useFocusEffect(useCallback(() => {
    if (!account) return;
    void refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const queueRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 300);
    };
    const socket = connectRealtime(account.api);
    socket.on('connect', () => { setOnline(true); queueRefresh(); });
    socket.on('disconnect', () => setOnline(false));
    socket.on('connect_error', () => setOnline(false));
    for (const event of ['new_message', 'contact_updated', 'message_read', 'message_deleted', 'message_edited']) socket.on(event, queueRefresh);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') { socket.connect(); void refresh(); }
      else socket.disconnect();
    });
    return () => { clearTimeout(refreshTimer); appState.remove(); socket.disconnect(); };
  }, [account, refresh]));

  const visible = useMemo(() => contacts.filter(contact => {
    return contact.archived === archived && contact.isGroup === (filter === 'groups')
      && (filter !== 'mine' || contact.assignedUserIds?.includes(account?.session.user.id ?? ''))
      && (!unreadOnly || contact.unreadCount > 0)
      && `${contact.name} ${contact.phone} ${contact.messages?.[0]?.content ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
  }).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)
    || (Date.parse(b.messages?.[0]?.createdAt ?? '') || 0) - (Date.parse(a.messages?.[0]?.createdAt ?? '') || 0)), [contacts, filter, search, archived, unreadOnly, account]);
  const archivedCount = contacts.filter(contact => contact.archived).length;
  function tabCount(tab: typeof filter) {
    return contacts.filter(contact => contact.archived === archived && contact.isGroup === (tab === 'groups')
      && (tab !== 'mine' || contact.assignedUserIds?.includes(account?.session.user.id ?? '')))
      .reduce((sum, contact) => sum + Math.max(0, contact.unreadCount), 0);
  }

  function logout() {
    Alert.alert('Sair do CotrimBot?', 'Você poderá entrar novamente com sua conta.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void signOut().catch(() => setError('Não foi possível remover a sessão. Tente novamente.')) },
    ]);
  }

  return <SafeAreaView style={ui.screen} edges={['top', 'bottom', 'left', 'right']}>
    <View style={styles.header}>
      <View style={styles.heading}><Text style={[ui.title, { flex: 1 }]}>Conversas</Text><IconButton name="logout" label="Sair da conta" onPress={logout} /></View>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <Field accessibilityLabel="Buscar conversa" placeholder="Buscar" value={search} onChangeText={setSearch} style={styles.searchInput} returnKeyType="search" />
        {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setSearch('')} style={styles.clear}><Icon name="close" size={16} color={colors.muted} /></Pressable>}
      </View>
      <View style={styles.filters}>{([['mine', 'Minhas'], ['groups', 'Grupos'], ['conversations', 'Conversas']] as const).map(([key, label]) =>
        <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={[styles.filter, filter === key && styles.selected]}><Text style={{ color: filter === key ? colors.text : colors.muted, fontSize: 14, fontWeight: '500' }}>{label}</Text>{tabCount(key) > 0 && <Text style={styles.tabCount}>{tabCount(key) > 99 ? '99+' : tabCount(key)}</Text>}</Pressable>)}</View>
      <View style={styles.archiveRow}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: archived }} onPress={() => setArchived(value => !value)} style={[styles.archive, archived && { backgroundColor: '#ffffff0f' }]}>
          <Icon name="archive" size={17} color={colors.muted} /><Text style={[ui.muted, { flex: 1 }]}>Arquivadas</Text><Text style={styles.time}>{archivedCount}</Text><Icon name="chevron" size={14} color={colors.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: unreadOnly }} onPress={() => setUnreadOnly(value => !value)} style={[styles.unreadFilter, unreadOnly && styles.selected]}><Text style={styles.time}>Não lidas</Text></Pressable>
      </View>
    </View>
    <ErrorNotice message={error} />
    {error && <View style={{ paddingHorizontal: 20 }}><Button label="Tentar novamente" secondary onPress={manualRefresh} busy={refreshing} /></View>}
    <FlatList data={visible} keyExtractor={item => String(item.id)} refreshing={refreshing} onRefresh={manualRefresh} keyboardShouldPersistTaps="handled"
      contentContainerStyle={visible.length ? undefined : { flexGrow: 1 }}
      ListEmptyComponent={<View style={ui.center}><Icon name="chat" size={36} color="#52525b" /><Text style={[ui.muted, { textAlign: 'center' }]}>{refreshing ? 'Carregando conversas…' : search ? 'Nenhuma conversa encontrada.' : filter === 'mine' ? 'Nenhuma conversa atribuída a você.' : 'Nenhuma conversa por aqui.'}</Text>{!refreshing && filter === 'mine' && <Button label="Ver conversas" secondary onPress={() => setFilter('conversations')} />}</View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Abrir conversa com ${item.name || item.phone}${item.unreadCount ? `, ${item.unreadCount} não lidas` : ''}`} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(item.id), name: item.name || item.phone, photo: item.profilePictureUrl ?? '', phone: item.phone, group: item.isGroup ? '1' : '0' } })} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
        <Avatar name={item.name || item.phone} uri={item.profilePictureUrl} contactId={item.id} />
        <View style={styles.preview}>
          <View style={styles.rowTitle}><Text numberOfLines={1} style={[styles.name, item.unreadCount > 0 && { fontWeight: '600' }]}>{item.name || item.phone}</Text><Text style={styles.time}>{sidebarDate(item.messages?.[0]?.createdAt)}</Text></View>
          <View style={styles.rowTitle}><Text numberOfLines={1} style={[ui.muted, { flex: 1, fontSize: 13 }]}>{item.messages?.[0]?.deletedAt ? 'Mensagem apagada' : item.messages?.[0]?.content || (item.messages?.[0] ? 'Mensagem de mídia' : item.phone)}</Text>{item.pinned && <Icon name="pin" size={12} color={colors.muted} />}{item.unreadCount > 0 && <Text style={styles.badge}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>}</View>
        </View>
      </Pressable>} />
    <View style={styles.accountBar}><Avatar name={account?.session.user.name ?? 'Conta'} uri={account?.session.user.image} size={32} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.accountName}>{account?.session.user.name}</Text><Text style={styles.time}>{online ? 'Conectado' : 'Reconectando…'}</Text></View><Text style={styles.wordmark}>CotrimBot</Text></View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 12 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderRadius: 999, backgroundColor: '#ffffff09', borderWidth: 1, borderColor: '#ffffff1a' },
  searchInput: { flex: 1, minHeight: 44, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 10, paddingVertical: 10 }, clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 8 }, filter: { flex: 1, minHeight: 44, borderRadius: 999, backgroundColor: '#ffffff09', borderWidth: 1, borderColor: '#ffffff1a', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }, selected: { backgroundColor: '#3f3f46', borderColor: '#ffffff33' }, tabCount: { color: '#d4d4d8', fontSize: 10 },
  archiveRow: { flexDirection: 'row', gap: 8 }, archive: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 10, paddingHorizontal: 8 }, unreadFilter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', marginHorizontal: 8, paddingHorizontal: 8, paddingVertical: 17, gap: 10, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  preview: { flex: 1, gap: 5 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 }, name: { color: colors.text, fontSize: 16, fontWeight: '500', flex: 1 }, time: { color: colors.muted, fontSize: 11 },
  accountBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, accountName: { fontSize: 12, color: colors.text, marginBottom: 3 }, wordmark: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  badge: { color: colors.background, backgroundColor: colors.accent, borderRadius: 12, minWidth: 24, paddingHorizontal: 6, paddingVertical: 3, textAlign: 'center', fontSize: 12, fontWeight: '700' },
});

function sidebarDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (day(date) === day(new Date())) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  if (day(date) === day(new Date(Date.now() - 86400000))) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
}
