import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, type TextInputInstance, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, colors, ErrorNotice, Field, IconButton, ui } from '../../components/ui';
import { useAccount } from '../../lib/session';
import { connectRealtime } from '../../lib/realtime';
import type { Contact, Message, UploadAttachment } from '../../lib/types';
import { ChatMessage } from '../../components/chat-message';
import { findMessages } from '../../lib/message-search';
import { canReply } from '../../lib/message-composer';
import { AttachmentPickerButton, ComposerPreview } from '../../components/composer-preview';
import { VoiceRecorder } from '../../components/voice-recorder';
import { useDraft } from '../../lib/use-draft';
import { draftKey } from '../../lib/drafts';

function mergeMessages(current: Message[], incoming: Message[]) {
  const indexed = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) indexed.set(message.id, message);
  return [...indexed.values()].sort((a, b) => b.id - a.id);
}

export default function ChatRoute() {
  const { account } = useAccount();
  const params = useLocalSearchParams<{ id: string; name?: string; photo?: string; phone?: string; group?: string; search?: string }>();
  const scope = draftKey(account?.api.server ?? '', account?.session.user.id ?? '', account?.session.session.activeOrganizationId, Number(params.id));
  return <Chat key={scope} draftScope={scope} contactId={Number(params.id)} name={params.name} photo={params.photo} phone={params.phone} isGroup={params.group === '1'} searching={params.search === '1'} />;
}

function Chat({ contactId, name, photo, phone, isGroup, searching, draftScope }: { contactId: number; name?: string; photo?: string; phone?: string; isGroup: boolean; searching: boolean; draftScope: string }) {
  const { account } = useAccount();
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(Keyboard.isVisible());
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { text: draft, update: setDraft, ready: draftReady, saving: draftSaving, error: draftError } = useDraft(draftScope);
  const [recordingActive, setRecordingActive] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachment, setAttachment] = useState<UploadAttachment | null>(null);
  const [picking, setPicking] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const currentReply = replyTo ? messages.find(message => message.id === replyTo.id) ?? replyTo : null;
  const [profile, setProfile] = useState<Contact | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const historyCursor = useRef<number | null>(null);
  const pendingScroll = useRef<number | null>(null);
  const scrollAttempts = useRef(0);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadingOlder = useRef(false);
  const initialized = useRef(false);
  const sendLock = useRef(false);
  const list = useRef<FlatList<Message>>(null);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const load = useCallback(async () => {
    if (!account || !Number.isSafeInteger(contactId) || contactId <= 0) return;
    try {
      const page = await account.api.messages(contactId);
      setMessages(current => mergeMessages(current, page.messages));
      if (!initialized.current) { setCursor(page.nextCursor); historyCursor.current = page.nextCursor; initialized.current = true; setHistoryReady(true); }
      await account.api.markRead(contactId);
      setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as mensagens.'); }
    finally { setLoading(false); }
  }, [account, contactId]);

  useFocusEffect(useCallback(() => {
    if (!account) return;
    let active = true;
    void account.api.contact(contactId).then(value => { if (active) setProfile(value); }).catch(() => {});
    void load();
    const socket = connectRealtime(account.api);
    socket.on('connect', () => void load());
    socket.on('new_message', (payload: { message: Message }) => {
      if (payload?.message?.contactId !== contactId) return;
      setMessages(current => mergeMessages(current, [payload.message]));
      void account.api.markRead(contactId).catch(() => {});
    });
    socket.on('message_deleted', (payload: { messageId: number; deletedAt: string }) => {
      setMessages(current => current.map(message => message.id === payload.messageId ? { ...message, deletedAt: payload.deletedAt } : message));
    });
    socket.on('message_edited', (payload: { messageId: number; content: string }) => {
      setMessages(current => current.map(message => message.id === payload.messageId ? { ...message, content: payload.content } : message));
    });
    socket.on('message_read', (payload: { messageId: number; readAt: string }) => {
      setMessages(current => current.map(message => message.id === payload.messageId ? { ...message, readAt: payload.readAt } : message));
    });
    socket.on('contact_updated', (contact: Contact) => { if (contact.id === contactId) setProfile(current => ({ ...current, ...contact })); });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { socket.connect(); void load(); }
      else socket.disconnect();
    });
    return () => { active = false; subscription.remove(); socket.disconnect(); };
  }, [account, contactId, load]));

  async function older() {
    if (!account || !cursor || loadingOlder.current) return;
    loadingOlder.current = true;
    setLoading(true);
    try {
      const page = await account.api.messages(contactId, cursor);
      setMessages(current => mergeMessages(current, page.messages));
      setCursor(page.nextCursor); historyCursor.current = page.nextCursor; setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar o histórico.'); }
    finally { loadingOlder.current = false; setLoading(false); }
  }

  async function send() {
    if (!account || sendLock.current || picking || recordingActive || !draftReady || (!draft.trim() && !attachment)) return;
    if (currentReply && !canReply(currentReply)) { setReplyTo(null); setError('Essa mensagem não pode mais ser respondida. Seu texto foi mantido.'); return; }
    sendLock.current = true;
    const text = draft.trim();
    setSending(true); setError('');
    try {
      const result = attachment ? await account.api.sendMedia(contactId, attachment, text, currentReply?.id)
        : await account.api.send(contactId, text, currentReply?.id);
      setMessages(current => mergeMessages(current, [result.message]));
      setDraft(''); setReplyTo(null); setAttachment(null); list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (failure) { setError(failure instanceof Error ? `${failure.message} Seu texto e anexo foram mantidos.` : 'Não foi possível enviar. Seu texto e anexo foram mantidos.'); }
    finally { setSending(false); sendLock.current = false; }
  }

  const hasSearchQuery = !!query.trim();
  const canSearch = historyReady && !loading;
  // Search older pages as well; leaving search cancels further requests.
  useEffect(() => {
    if (!account || !searching || !hasSearchQuery || !canSearch) return;
    let active = true;
    const timer = setTimeout(async () => {
      setSearchBusy(true); setSearchError('');
      try {
        let before = historyCursor.current;
        while (active && before) {
          const page = await account.api.messages(contactId, before);
          if (!active) return;
          if (page.nextCursor === before) throw new Error('Não foi possível avançar no histórico. Tente novamente.');
          setMessages(current => mergeMessages(current, page.messages));
          historyCursor.current = page.nextCursor; setCursor(page.nextCursor); before = page.nextCursor;
        }
      } catch (failure) { if (active) setSearchError(failure instanceof Error ? failure.message : 'Não foi possível pesquisar todo o histórico.'); }
      finally { if (active) setSearchBusy(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [account, searching, hasSearchQuery, canSearch, contactId, searchRetry]);

  const visibleMessages = useMemo(() => searching ? findMessages(messages, query) : messages, [messages, query, searching]);
  useEffect(() => {
    if (searching || pendingScroll.current === null) return;
    const index = messages.findIndex(message => message.id === pendingScroll.current);
    if (index < 0) return;
    pendingScroll.current = null; scrollAttempts.current = 0;
    scrollTimer.current = setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: .5, animated: true }), 100);
    return () => clearTimeout(scrollTimer.current);
  }, [searching, messages]);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  function closeSearch(messageId?: number) {
    Keyboard.dismiss();
    if (messageId !== undefined) { pendingScroll.current = messageId; setHighlighted(messageId); }
    setQuery(''); router.setParams({ search: undefined });
  }

  if (!Number.isSafeInteger(contactId) || contactId <= 0) return <View style={ui.center}><ErrorNotice message="Conversa inválida." /></View>;
  const displayName = profile?.name || name || 'Conversa';
  const displayPhoto = profile?.profilePictureUrl || photo;
  const displayPhone = profile?.phone || phone;
  const group = profile?.isGroup ?? isGroup;
  function reply(message: Message) {
    if (sending || recordingActive || !canReply(message)) return;
    setReplyTo(message); requestAnimationFrame(() => input.current?.focus());
  }
  const replyName = currentReply?.direction === 'OUTGOING' ? currentReply.sentByUser?.name || 'Você' : currentReply?.senderName || displayName;
  function openContact() { Keyboard.dismiss(); router.push({ pathname: '/contact/[id]', params: { id: String(contactId) } }); }

  return <KeyboardAvoidingView style={[ui.screen, styles.screen]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={Platform.OS === 'ios'} keyboardVerticalOffset={0}>
    <SafeAreaView style={[ui.screen, styles.screen]} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <IconButton name="back" label="Voltar às conversas" plain onPress={() => router.back()} />
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir informações do contato" onPress={openContact}><Avatar name={displayName} uri={displayPhoto} size={44} contactId={contactId} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Informações de ${displayName}`} onPress={openContact} style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}><Text numberOfLines={1} style={styles.contactName}>{displayName}</Text><Text numberOfLines={1} style={styles.subtitle}>{group ? 'Grupo' : displayPhone || 'WhatsApp'}</Text></Pressable>
      <IconButton name="more" label="Opções da conversa" plain onPress={() => Alert.alert('Conversa', displayName, [{ text: 'Informações do contato', onPress: openContact }, { text: 'Atualizar conversa', onPress: () => void load() }, { text: 'Cancelar', style: 'cancel' }])} />
      <IconButton name="info" label="Informações do contato" plain onPress={openContact} />
    </View>
      {searching && <View style={styles.searchPanel}>
        <View style={styles.searchRow}><Field accessibilityLabel="Buscar mensagem nesta conversa" placeholder="Buscar mensagem..." value={query} onChangeText={setQuery} autoFocus autoCorrect={false} returnKeyType="search" style={styles.searchInput} /><IconButton name="close" label="Fechar busca" plain onPress={() => closeSearch()} /></View>
        <Text accessibilityLiveRegion="polite" style={styles.searchStatus}>{!hasSearchQuery ? 'Digite para pesquisar nesta conversa.' : searchBusy || !!cursor && !searchError ? `${visibleMessages.length} encontradas · Buscando no histórico...` : `${visibleMessages.length} mensagens encontradas${searchError ? ' · Busca incompleta' : ''}. Toque para localizar.`}</Text>
        <ErrorNotice message={searchError} />{!!searchError && <Button label="Continuar busca no histórico" secondary onPress={() => setSearchRetry(value => value + 1)} />}
      </View>}
      <FlatList ref={list} style={styles.list} inverted data={visibleMessages} keyExtractor={item => String(item.id)} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={false} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.messages}
        onScrollToIndexFailed={info => {
          if (scrollAttempts.current++ >= 4) return;
          list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: .5, animated: true }), 200);
        }}
        ListEmptyComponent={<Text style={[ui.muted, { textAlign: 'center', padding: 24 }]}>{loading ? 'Carregando mensagens…' : searching ? searchBusy || cursor ? 'Buscando no histórico…' : 'Nenhuma mensagem encontrada.' : 'Envie a primeira mensagem.'}</Text>}
        ListFooterComponent={!searching && cursor ? <Button label="Carregar anteriores" secondary busy={loading} onPress={() => void older()} /> : undefined}
        renderItem={({ item, index }) => <View>
          {(index === visibleMessages.length - 1 || dateKey(item.createdAt) !== dateKey(visibleMessages[index + 1].createdAt)) && <View style={styles.date}><Text style={styles.dateText}>{dateLabel(item.createdAt)}</Text></View>}
          <Pressable accessibilityRole={searching ? 'button' : undefined} accessibilityLabel={searching ? 'Localizar esta mensagem na conversa' : undefined} disabled={!searching} onPress={() => closeSearch(item.id)} style={highlighted === item.id && !searching ? styles.highlight : undefined}>
            <ChatMessage message={item} contactName={displayName} contactPhoto={displayPhoto} isGroup={group} onReply={!searching && !sending && !recordingActive ? reply : undefined} />
          </Pressable>
        </View>} />
      <ErrorNotice message={error} />
      <ErrorNotice message={draftError} />
      {error && <Button label="Atualizar conversa" secondary busy={loading} onPress={() => void load()} />}
      {!searching && <View style={[styles.composerArea, { paddingBottom: keyboardOpen ? 6 : Math.max(insets.bottom, 6) }]}>
        <ComposerPreview reply={currentReply} replyName={replyName} attachment={attachment} disabled={sending} onCancelReply={() => setReplyTo(null)} onRemoveAttachment={() => setAttachment(null)} />
        {sending && attachment && <Text accessibilityLiveRegion="polite" style={styles.uploadStatus}>Enviando anexo...</Text>}
        {!!draft && !sending && !draftError && <Text style={styles.uploadStatus}>{draftSaving ? 'Salvando rascunho...' : 'Rascunho salvo'}</Text>}
        <View style={styles.composer}>
          {!recordingActive && <><AttachmentPickerButton disabled={sending} onPick={file => { setAttachment(file); setError(''); }} onPicking={setPicking} onError={setError} />
          <Field inputRef={input} accessibilityLabel={attachment ? 'Legenda do anexo' : 'Mensagem'} placeholder={!draftReady ? 'Recuperando rascunho...' : attachment ? 'Legenda (opcional)...' : 'Digite uma mensagem...'} multiline maxLength={10000} value={draft} onChangeText={setDraft} editable={!sending && draftReady} style={styles.draft} /></>}
          {(!draft.trim() && !attachment || recordingActive) ? <VoiceRecorder disabled={sending || picking || !draftReady} onRecorded={setAttachment} onBusyChange={setRecordingActive} onError={setError} />
            : <IconButton name="send" label={attachment ? 'Enviar anexo' : 'Enviar mensagem'} onPress={() => void send()} busy={sending} disabled={picking || !draftReady || (!draft.trim() && !attachment)} />}
        </View>
      </View>}
      {searching && !keyboardOpen && <View style={{ height: insets.bottom }} />}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000' }, list: { flex: 1 },
  header: { flexDirection: 'row', gap: 4, alignItems: 'center', minHeight: 68, paddingLeft: 2, paddingRight: 8, paddingVertical: 8, backgroundColor: '#080808', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  contactName: { color: colors.text, fontSize: 16, fontWeight: '600', lineHeight: 23 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  messages: { paddingHorizontal: 8, paddingVertical: 10, gap: 9 },
  composerArea: { backgroundColor: '#000', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, composer: { paddingHorizontal: 10, paddingTop: 6, flexDirection: 'row', gap: 8, alignItems: 'flex-end' }, uploadStatus: { color: colors.muted, fontSize: 12, paddingHorizontal: 12, paddingTop: 6 },
  draft: { flex: 1, maxHeight: 128, minHeight: 46, borderRadius: 24, backgroundColor: '#1c1c1e', paddingTop: 11, paddingBottom: 11, paddingHorizontal: 16, borderWidth: 1, borderColor: '#ffffff33', fontSize: 16, lineHeight: 22 },
  searchPanel: { padding: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, borderRadius: 24 }, searchStatus: { color: colors.muted, fontSize: 12, lineHeight: 18 }, highlight: { borderRadius: 12, backgroundColor: '#ffffff14', paddingVertical: 4 },
  date: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, marginVertical: 16, borderRadius: 12, backgroundColor: '#18181b' }, dateText: { color: colors.muted, fontSize: 11 },
});

function dateKey(value: string) { return new Date(value).toLocaleDateString('en-CA'); }
function dateLabel(value: string) {
  if (dateKey(value) === dateKey(new Date().toISOString())) return 'Hoje';
  if (dateKey(value) === dateKey(new Date(Date.now() - 86400000).toISOString())) return 'Ontem';
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
