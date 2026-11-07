import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Animated, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { AnimatedUnreadBadge } from '../components/animated-unread-badge';
import { unreadCounts } from '../lib/unread-counts';
import { coalescedRefresh } from '../lib/coalesced-refresh';
import { ConversationPreview } from '../components/conversation-preview';
import { ConversationFilterBar } from '../components/conversation-filter-bar';
import { emptyConversationFilters, matchesConversationFilters } from '../lib/conversation-filters';
import { ScrollTopFade } from '../components/scroll-top-fade';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, colors, ErrorNotice, Field, Icon, ui } from '../components/ui';
import { useSectionTransition } from '../lib/use-section-transition';
import { useAccount } from '../lib/session';
import { connectRealtime } from '../lib/realtime';
import type { Contact } from '../lib/types';

const sections = [
  { key: 'conversations', label: 'Conversas', icon: 'chat' },
  { key: 'mine', label: 'Minhas', icon: 'checks' },
  { key: 'groups', label: 'Grupos', icon: 'groups' },
  { key: 'contacts', label: 'Contatos', icon: 'contacts' },
  { key: 'profile', label: 'Perfil', icon: 'user' },
] as const;

export default function Conversations() {
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<ComponentRef<typeof View> | null>(null);
  const [dockHeight, setDockHeight] = useState(80);
  const [dockWidth, setDockWidth] = useState(0);
  const [scrollY] = useState(() => new Animated.Value(0));
  const bottomSpacing = dockHeight + insets.bottom + 24;
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const section = sections.find(item => item.key === sectionParam)?.key ?? 'conversations';
  const itemWidth = Math.max(0, dockWidth - 16) / sections.length;
  const transition = useSectionTransition(sections.findIndex(item => item.key === section), itemWidth);
  const isContacts = section === 'contacts';
  const isProfile = section === 'profile';
  useLayoutEffect(() => { scrollY.setValue(0); }, [isProfile, scrollY]);
  const title = sections.find(item => item.key === section)?.label ?? 'Conversas';
  const { account, signOut } = useAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [conversationFilters, setConversationFilters] = useState(emptyConversationFilters);
  const hasConversationFilters = Object.values(conversationFilters).some(Boolean);
  const filter = section === 'mine' ? 'mine' : section === 'groups' ? 'groups' : 'conversations';
  const [archived, setArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);

  const refresh = useMemo(() => coalescedRefresh(async () => {
    if (!account) return;
    try {
      const updatedContacts = await account.api.contacts();
      setContacts(updatedContacts);
      if (!updatedContacts.some(contact => contact.archived)) setArchived(false);
      setError('');
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as conversas.'); }
    finally { setRefreshing(false); }
  }), [account]);

  function manualRefresh() { setRefreshing(true); void refresh(); }

  useFocusEffect(useCallback(() => {
    if (!account) return;
    void refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const queueRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh(); }, 200);
    };
    const socket = connectRealtime(account.api);
    socket.on('connect', () => { setOnline(true); queueRefresh(); });
    socket.on('disconnect', () => setOnline(false));
    socket.on('connect_error', () => setOnline(false));
    for (const event of ['new_message', 'contact_updated', 'message_read', 'message_deleted', 'message_edited', 'message_flags_updated', 'conversation_read']) socket.on(event, queueRefresh);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') { socket.connect(); void refresh(); }
      else socket.disconnect();
    });
    return () => { clearTimeout(refreshTimer); appState.remove(); socket.disconnect(); };
  }, [account, refresh]));

  const visible = useMemo(() => contacts.filter(contact => {
    if (isContacts) return !contact.isGroup && `${contact.name} ${contact.phone}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
    return contact.archived === archived && contact.isGroup === (filter === 'groups')
      && matchesConversationFilters(contact, conversationFilters)
      && (filter !== 'mine' || contact.assignedUserIds?.includes(account?.session.user.id ?? ''))
      && `${contact.name} ${contact.phone} ${contact.messages?.[0]?.content ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
  }).sort((a, b) => isContacts ? (a.name || a.phone).localeCompare(b.name || b.phone, 'pt-BR') : Number(!!b.pinned) - Number(!!a.pinned)
    || (Date.parse(b.messages?.[0]?.createdAt ?? '') || 0) - (Date.parse(a.messages?.[0]?.createdAt ?? '') || 0)), [contacts, filter, search, archived, account, isContacts, conversationFilters]);
  const counts = useMemo(() => unreadCounts(contacts, account?.session.user.id ?? ''), [contacts, account]);
  const archivedCount = contacts.filter(contact => contact.archived).length;

  function openConversation(contact: Contact) {
    setPreviewContact(null);
    router.push({ pathname: isContacts ? '/contact/[id]' : '/chat/[id]', params: {
      id: String(contact.id), name: contact.name || contact.phone, photo: contact.profilePictureUrl ?? '',
      phone: contact.phone, group: contact.isGroup ? '1' : '0',
    } });
  }

  function logout() {
    Alert.alert('Sair do CotrimBot?', 'Você poderá entrar novamente com sua conta.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void signOut().catch(() => setError('Não foi possível remover a sessão. Tente novamente.')) },
    ]);
  }

  return <SafeAreaView style={[ui.screen, styles.screen]} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <View style={styles.heading}><Image source={require('../../assets/cotrimbot.png')} style={styles.headerLogo} resizeMode="contain" accessibilityLabel="CotrimBot" /><Text style={styles.title}>{title}</Text></View>
    </View>
    <ErrorNotice message={error} />
    {error && <View style={{ paddingHorizontal: 20 }}><Button label="Tentar novamente" secondary onPress={manualRefresh} busy={refreshing} /></View>}
    <View style={styles.body}>
      <BlurTargetView ref={blurTarget} style={styles.body}>
        <Animated.View style={[styles.body, transition.contentStyle]}>
          {isProfile ? <ScrollView contentContainerStyle={[styles.profile, { paddingBottom: bottomSpacing }]}>
            <Avatar name={account?.session.user.name ?? 'Conta'} uri={account?.session.user.image} size={88} />
            <Text style={styles.profileName}>{account?.session.user.name}</Text>
            <Text style={styles.profileEmail}>{account?.session.user.email}</Text>
            <View style={styles.profileCard}>
              <Text style={styles.profileLabel}>CONEXÃO</Text>
              <View style={styles.connection}><View style={[styles.connectionDot, { backgroundColor: online ? '#86d9a3' : '#e8bb72' }]} /><Text style={ui.text}>{online ? 'Conectado' : 'Reconectando…'}</Text></View>
              <Text style={styles.profileLabel}>SERVIDOR</Text>
              <Text selectable style={ui.muted}>{account?.api.server}</Text>
            </View>
            <Button label="Sair da conta" secondary onPress={logout} style={{ alignSelf: 'stretch' }} />
          </ScrollView> : <Animated.FlatList data={visible} keyExtractor={item => String(item.id)} refreshing={refreshing} onRefresh={manualRefresh} keyboardShouldPersistTaps="handled"
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })} scrollEventThrottle={16}
            contentContainerStyle={[styles.list, { paddingBottom: bottomSpacing }, !visible.length && { flexGrow: 1 }]}
            ListHeaderComponent={<View style={styles.listHeader}>
              <View style={styles.searchContainer}><View style={styles.search}>
                <Icon name="search" size={18} color="#d4d4d8" />
                <Field accessibilityLabel={isContacts ? "Buscar contato" : "Buscar conversa"} placeholder="Buscar" placeholderTextColor="#d4d4d8" value={search} onChangeText={setSearch} style={styles.searchInput} returnKeyType="search" />
                {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setSearch('')} style={styles.clear}><Icon name="close" size={16} color="#d4d4d8" /></Pressable>}
              </View></View>
              {!isContacts && <ConversationFilterBar filters={conversationFilters} onChange={setConversationFilters} />}
              {!isContacts && archivedCount > 0 && <View style={styles.archiveRow}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: archived }} onPress={() => setArchived(value => !value)} style={[styles.archive, archived && { backgroundColor: '#ffffff0f' }]}>
                  <Icon name="archive" size={17} color={colors.muted} /><Text style={[ui.muted, { flex: 1 }]}>Arquivadas</Text><Text style={styles.time}>{archivedCount}</Text><Icon name="chevron" size={14} color={colors.muted} />
                </Pressable>
              </View>}
            </View>}
            ListEmptyComponent={<View style={ui.center}><Icon name="chat" size={36} color="#52525b" /><Text style={[ui.muted, { textAlign: 'center' }]}>{refreshing ? 'Carregando conversas…' : search ? 'Nenhuma conversa encontrada.' : !isContacts && hasConversationFilters ? 'Nenhuma conversa com esses filtros.' : isContacts ? 'Nenhum contato encontrado.' : filter === 'mine' ? 'Nenhuma conversa atribuída a você.' : 'Nenhuma conversa por aqui.'}</Text>{!refreshing && !isContacts && !hasConversationFilters && filter === 'mine' && <Button label="Ver conversas" secondary onPress={() => router.setParams({ section: 'conversations' })} />}</View>}
            renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${isContacts ? 'Ver contato' : 'Abrir conversa com'} ${item.name || item.phone}${item.unreadCount ? `, ${item.unreadCount} não lidas` : ''}`} onPress={() => openConversation(item)}
              delayLongPress={400} onLongPress={isContacts ? undefined : () => setPreviewContact(item)}
              accessibilityHint={isContacts ? undefined : 'Toque para abrir ou mantenha pressionado para ver a prévia.'}
              accessibilityActions={isContacts ? undefined : [{ name: 'longpress', label: 'Ver prévia da conversa' }]}
              onAccessibilityAction={event => { if (!isContacts && event.nativeEvent.actionName === 'longpress') setPreviewContact(item); }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
              <Avatar name={item.name || item.phone} uri={item.profilePictureUrl} contactId={item.id} size={52} />
              <View style={styles.preview}>
                <View style={styles.rowTitle}><Text numberOfLines={1} style={[styles.name, item.unreadCount > 0 && { fontWeight: '600' }]}>{item.name || item.phone}</Text>{!isContacts && <Text style={styles.time}>{sidebarDate(item.messages?.[0]?.createdAt)}</Text>}</View>
                <View style={styles.rowTitle}><Text numberOfLines={1} style={styles.messagePreview}>{isContacts ? item.phone : item.messages?.[0]?.deletedAt ? 'Mensagem apagada' : item.messages?.[0]?.content || (item.messages?.[0] ? 'Mensagem de mídia' : item.phone)}</Text>{!isContacts && item.pinned && <Icon name="pin" size={12} color={colors.muted} />}{!isContacts && item.unreadCount > 0 && <Text style={styles.badge}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>}</View>
              </View>
            </Pressable>} />}
        </Animated.View>
      </BlurTargetView>
      {!isProfile && <ScrollTopFade target={blurTarget} scrollY={scrollY} />}
    </View>
    <View pointerEvents="box-none" onLayout={event => setDockHeight(event.nativeEvent.layout.height)} style={[styles.dockContainer, { bottom: insets.bottom + 12, left: insets.left, right: insets.right }]}>
      <View accessibilityRole="tablist" onLayout={event => setDockWidth(event.nativeEvent.layout.width)} style={styles.dock}>
        {itemWidth > 0 && <Animated.View pointerEvents="none" style={[styles.dockIndicator, { width: itemWidth }, transition.indicatorStyle]} />}
        {sections.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={counts[item.key] > 0 ? `${item.label}, ${counts[item.key]} mensagens não lidas` : item.label} accessibilityState={{ selected: section === item.key }}
          onPress={() => {
            if (item.key !== section) { setSearch(''); setArchived(false); setConversationFilters(emptyConversationFilters); }
            router.setParams({ section: item.key });
          }} style={({ pressed }) => [styles.dockItem, pressed && { opacity: .6 }]}>
          <View style={styles.dockIcon}><Icon name={item.icon} size={27} color={section === item.key ? '#ffffff' : '#d4d4d8'} /><AnimatedUnreadBadge count={counts[item.key]} /></View>
          <Text numberOfLines={1} style={[styles.dockLabel, section === item.key && styles.dockLabelSelected]}>{item.label}</Text>
        </Pressable>)}
      </View>
    </View>
    {previewContact && <ConversationPreview key={previewContact.id} contact={previewContact} onClose={() => setPreviewContact(null)} onOpen={() => openConversation(previewContact)} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#080809' },
  body: { flex: 1, overflow: 'hidden' },
  header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6, gap: 12 },
  listHeader: { paddingHorizontal: 6, paddingTop: 32, paddingBottom: 6, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 2 },
  headerLogo: { width: 36, height: 36 },
  title: { flexShrink: 1, textAlign: 'center', color: '#fafafa', fontSize: 28, fontWeight: '600', letterSpacing: -.8 },
  searchContainer: { width: '92%', alignSelf: 'center' },
  search: { marginHorizontal: -2.5, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, borderRadius: 999, backgroundColor: '#27272a' },
  searchInput: { color: '#ededf0', flex: 1, minHeight: 44, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  archiveRow: { flexDirection: 'row', gap: 12 },
  archive: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderRadius: 12, paddingHorizontal: 10 },
  list: { paddingHorizontal: 12 },
  row: { flexDirection: 'row', marginHorizontal: 8, paddingHorizontal: 8, gap: 14, alignItems: 'center', minHeight: 78 },
  preview: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: 13, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ffffff14' },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#fafafa', fontSize: 16, fontWeight: '500', flex: 1 },
  time: { color: '#b9b9be', fontSize: 11 },
  messagePreview: { color: '#b9b9be', flex: 1, fontSize: 13, lineHeight: 20 },
  badge: { color: colors.background, backgroundColor: colors.accent, borderRadius: 12, minWidth: 24, paddingHorizontal: 6, paddingVertical: 3, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  dockContainer: { position: 'absolute', paddingHorizontal: 16, alignItems: 'center' },
  dock: { width: '100%', maxWidth: 440, flexDirection: 'row', padding: 8, borderRadius: 48, backgroundColor: '#121213' },
  dockItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 2, paddingVertical: 9, minHeight: 62, borderRadius: 36 },
  dockIndicator: { position: 'absolute', left: 8, top: 8, bottom: 8, borderRadius: 36, backgroundColor: '#424244', borderWidth: 1, borderColor: '#ffffff18' },
  dockIcon: { width: 27, height: 27 },
  dockLabel: { color: '#c5c5ca', fontSize: 12 },
  dockLabelSelected: { color: '#ffffff', fontWeight: '500' },
  profile: { alignItems: 'center', padding: 24, gap: 16 },
  profileName: { color: colors.text, fontSize: 24, fontWeight: '600', textAlign: 'center' },
  profileEmail: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  profileCard: { alignSelf: 'stretch', padding: 20, marginVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: '#ffffff25', backgroundColor: '#121213', gap: 14 },
  profileLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1.2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectionDot: { width: 7, height: 7, borderRadius: 4 },
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
