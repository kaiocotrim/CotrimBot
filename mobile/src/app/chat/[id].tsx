import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, type TextInputInstance, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, colors, ErrorNotice, Field, IconButton, ui } from '../../components/ui';
import { useAccount } from '../../lib/session';
import { connectRealtime } from '../../lib/realtime';
import type { Contact, Message, UploadAttachment } from '../../lib/types';
import { ChatMessage } from '../../components/chat-message';
import { findMessages } from '../../lib/message-search';
import { canReply } from '../../lib/message-composer';
import { AttachmentPickerButton, ComposerPreview, useAttachmentPicker, type AttachmentKind } from '../../components/composer-preview';
import { ComposerPanel, ComposerToggle } from '../../components/composer-panel';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../../lib/use-reduced-motion';
import type { MessageAnchor } from '../../lib/message-menu-layout';
import { MessageActionsMenu } from '../../components/message-actions-menu';
import { ComposerMenu } from '../../components/composer-menu';
import { PollComposer } from '../../components/poll-composer';
import type { preparePoll } from '../../lib/poll-composer';
import { AiRewriteButton } from '../../components/ai-rewrite-button';
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
  const reduceMotion = useReducedMotion();
  const [keyboardOpen, setKeyboardOpen] = useState(Keyboard.isVisible());
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageMenu, setMessageMenu] = useState<{ id: number; anchor: MessageAnchor } | null>(null);
  const menuMessage = messageMenu ? messages.find(message => message.id === messageMenu.id) : undefined;
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const publicDraft = useDraft(draftScope);
  const privateDraft = useDraft(`${draftScope}:private`);
  const { text: draft, update: setDraft, ready: draftReady, error: draftError } = privateMode ? privateDraft : publicDraft;
  const [recordingActive, setRecordingActive] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [panel, setPanel] = useState<'actions' | 'poll' | null>(null);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [closing, setClosing] = useState(false);
  const rewriteVersion = useRef(0);
  const rewriteLock = useRef(false);
  const recordingBusy = useCallback((busy: boolean) => {
    if (busy) { Keyboard.dismiss(); setPanel(null); }
    setRecordingActive(busy);
  }, []);
  useFocusEffect(useCallback(() => () => {
    rewriteVersion.current++;
    rewriteLock.current = false;
    setRewriting(false); setPanel(null); setMessageMenu(null);
  }, []));
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachment, setAttachment] = useState<UploadAttachment | null>(null);
  const [picking, setPicking] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const currentReply = replyTo ? messages.find(message => message.id === replyTo.id) ?? replyTo : null;
  const [profile, setProfile] = useState<Contact | null>(null);
  const [error, setError] = useState('');
  const mediaPicker = useAttachmentPicker({ disabled: sending || rewriting || closing || privateMode || picking, onPick: setAttachment, onPicking: setPicking, onError: setError });
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
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', event => {
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation(event);
      setPanel(null); setKeyboardOpen(true);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', event => {
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation(event);
      setKeyboardOpen(false);
    });
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
    socket.on('message_reaction', (payload: { messageId: number; reaction: string | null }) => { setMessages(current => current.map(message => message.id === payload.messageId ? { ...message, reaction: payload.reaction } : message)); });
    socket.on('message_flags_updated', (payload: { messageId: number; pinned?: boolean; favorited?: boolean; pinnedUntil?: string | null }) => {
      setMessages(current => current.map(message => message.id === payload.messageId ? { ...message, ...payload } : message));
    });
    socket.on('contact_updated', (contact: Contact) => { if (contact.id === contactId) setProfile(current => ({ ...current, ...contact })); });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { socket.connect(); void load(); }
      else socket.disconnect();
    });
    return () => { active = false; subscription.remove(); socket.disconnect(); };
  }, [account, contactId, load]));

  useFocusEffect(useCallback(() => {
    if (!panel) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!sendLock.current && !closing) setPanel(null);
      return true;
    });
    return () => subscription.remove();
  }, [panel, closing]));

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
    if (!account || sendLock.current || rewriteLock.current || closing || picking || recordingActive || !draftReady || (!draft.trim() && !attachment)) return;
    if (privateMode && attachment) { setError('Mensagens privadas aceitam somente texto. Remova o anexo para continuar.'); return; }
    if (currentReply && !canReply(currentReply)) { setReplyTo(null); setError('Essa mensagem não pode mais ser respondida. Seu texto foi mantido.'); return; }
    sendLock.current = true;
    const text = draft.trim();
    setSending(true); setError('');
    try {
      const result = attachment ? await account.api.sendMedia(contactId, attachment, text, currentReply?.id, includeSignature)
        : await account.api.send(contactId, text, currentReply?.id, { private: privateMode, includeSignature });
      setMessages(current => mergeMessages(current, [result.message]));
      setDraft(''); setReplyTo(null); setAttachment(null); list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (failure) { setError(failure instanceof Error ? `${failure.message} Seu texto e anexo foram mantidos.` : 'Não foi possível enviar. Seu texto e anexo foram mantidos.'); }
    finally { setSending(false); sendLock.current = false; }
  }

  const voiceReplyId = currentReply?.id;
  const sendVoice = useCallback(async (file: UploadAttachment) => {
    setAttachment(file);
    if (!account || sendLock.current || rewriteLock.current || picking || closing) {
      setError('O áudio foi mantido para você enviar quando a operação atual terminar.'); return;
    }
    sendLock.current = true; setSending(true); setError('');
    try {
      const result = await account.api.sendMedia(contactId, file, '', voiceReplyId, includeSignature);
      setMessages(current => mergeMessages(current, [result.message]));
      setAttachment(null); setReplyTo(null); list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (failure) { setError(failure instanceof Error ? `${failure.message} Seu áudio foi mantido para tentar novamente.` : 'Não foi possível enviar. Seu áudio foi mantido.'); }
    finally { sendLock.current = false; setSending(false); }
  }, [account, contactId, voiceReplyId, includeSignature, picking, closing]);

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

  function toggleActions() {
    Keyboard.dismiss(); setPanel(current => current ? null : 'actions');
  }

  function chooseMedia(kind: AttachmentKind) {
    setPanel(null); Keyboard.dismiss(); void mediaPicker.pick(kind);
  }

  function togglePrivate() {
    if (!privateMode && attachment) { setError('Remova o anexo antes de escrever uma mensagem privada.'); return; }
    setPrivateMode(value => !value); setPanel(null); setReplyTo(null);
    requestAnimationFrame(() => input.current?.focus());
  }

  async function sendPoll(poll: ReturnType<typeof preparePoll>) {
    if (!account || sendLock.current || rewriteLock.current || recordingActive || picking || closing || privateMode) throw new Error('Aguarde a operação atual antes de enviar a enquete.');
    sendLock.current = true; setSending(true);
    try {
      const result = await account.api.sendPoll(contactId, poll);
      setMessages(current => mergeMessages(current, [result.message]));
      setPanel(null); Keyboard.dismiss();
    } finally { sendLock.current = false; setSending(false); }
  }

  function closeTicket() {
    Alert.alert('Encerrar chamado com Bot?', 'A pesquisa de satisfação será enviada e os responsáveis serão removidos. Seu rascunho será mantido.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar chamado', onPress: () => { void (async () => {
        if (!account || sendLock.current || rewriteLock.current || recordingActive || picking) return;
        sendLock.current = true; setClosing(true); setError('');
        try {
          const result = await account.api.closeConversation(contactId);
          setMessages(current => mergeMessages(current, [result.message])); setProfile(result.contact); setPanel(null);
          Alert.alert('Chamado encerrado', 'A pesquisa foi enviada e os responsáveis foram removidos.');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível encerrar o chamado.'); }
        finally { sendLock.current = false; setClosing(false); }
      })(); } },
    ]);
  }

  async function rewriteDraft() {
    if (!account || !draftReady || !draft.trim() || rewriteLock.current || sendLock.current || closing || picking || recordingActive) return;
    if (draft.trim().length > 5000) { setError('A IA pode reformular textos de até 5.000 caracteres.'); return; }
    const version = ++rewriteVersion.current;
    rewriteLock.current = true; setRewriting(true); setError('');
    try {
      const rewritten = await account.api.rewriteMessage(draft);
      if (version !== rewriteVersion.current) return;
      setDraft(rewritten);
    } catch (failure) {
      if (version === rewriteVersion.current) setError(failure instanceof Error ? failure.message : 'Não foi possível reformular. Seu rascunho foi mantido.');
    } finally {
      if (version === rewriteVersion.current) { rewriteLock.current = false; setRewriting(false); }
    }
  }

  function closeSearch(messageId?: number) {
    Keyboard.dismiss();
    if (messageId !== undefined) { pendingScroll.current = messageId; setHighlighted(messageId); }
    setQuery(''); router.setParams({ search: undefined });
  }

  const openMessageMenu = useCallback((message: Message, anchor: MessageAnchor) => {
    if (sending || recordingActive) return;
    Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessageMenu({ id: message.id, anchor });
  }, [sending, recordingActive]);

  const reply = useCallback((message: Message) => {
    if (sending || recordingActive || !canReply(message)) return;
    setReplyTo(message); requestAnimationFrame(() => input.current?.focus());
  }, [sending, recordingActive]);

  if (!Number.isSafeInteger(contactId) || contactId <= 0) return <View style={ui.center}><ErrorNotice message="Conversa inválida." /></View>;
  const displayName = profile?.name || name || 'Conversa';
  const displayPhoto = profile?.profilePictureUrl || photo;
  const displayPhone = profile?.phone || phone;
  const group = profile?.isGroup ?? isGroup;
  const replyName = currentReply?.direction === 'OUTGOING' ? currentReply.sentByUser?.name || 'Você' : currentReply?.senderName || displayName;
  function openContact() { Keyboard.dismiss(); router.push({ pathname: '/contact/[id]', params: { id: String(contactId) } }); }

  return <KeyboardAvoidingView style={[ui.screen, styles.keyboardContainer]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={Platform.OS === 'ios'} keyboardVerticalOffset={0}>
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
            <ChatMessage message={item} contactName={displayName} contactPhoto={displayPhoto} isGroup={group} selected={messageMenu?.id === item.id} onMenu={!searching && !sending && !recordingActive ? openMessageMenu : undefined} />
          </Pressable>
        </View>} />
      <ErrorNotice message={error} />
      <ErrorNotice message={draftError} />
      {error && <Button label="Atualizar conversa" secondary busy={loading} onPress={() => void load()} />}
      {!searching && <View style={[styles.composerArea, { paddingBottom: keyboardOpen ? 6 : Math.max(insets.bottom, 6) }]}>
        <ComposerPreview reply={currentReply} replyName={replyName} attachment={attachment} disabled={sending || rewriting || closing} onCancelReply={() => setReplyTo(null)} onRemoveAttachment={() => setAttachment(null)} />
        {closing && <Text accessibilityLiveRegion="polite" style={styles.uploadStatus}>Encerrando chamado…</Text>}
        {privateMode && <View style={styles.privateNotice}><Text style={styles.privateText}>Mensagem privada · somente para a equipe</Text><IconButton name="close" label="Voltar à mensagem pública" plain disabled={sending || rewriting || closing} onPress={() => setPrivateMode(false)} /></View>}
        {rewriting && <Text accessibilityLiveRegion="polite" style={styles.uploadStatus}>Aprimorando mensagem com IA…</Text>}
        {sending && attachment && <Text accessibilityLiveRegion="polite" style={styles.uploadStatus}>Enviando anexo...</Text>}
        <View style={styles.composer}>
          {!recordingActive && <>
            <ComposerToggle open={panel !== null} disabled={sending || picking || rewriting || closing} onPress={toggleActions} />
            <View style={[styles.messageField, privateMode && styles.privateField]}>
              <Field inputRef={input} accessibilityLabel={privateMode ? 'Mensagem privada' : attachment ? 'Legenda do anexo' : 'Mensagem'} placeholder={!draftReady ? 'Recuperando rascunho...' : privateMode ? 'Mensagem privada' : attachment ? 'Legenda (opcional)' : 'Mensagem'} placeholderTextColor="#b6b6bc"
                multiline maxLength={10000} value={draft} onChangeText={setDraft} editable={!sending && !rewriting && !closing && draftReady} onFocus={() => { if (panel === 'actions') setPanel(null); }} style={styles.draft} />
              <AiRewriteButton enabled={!sending && !picking && !closing && draftReady && !!draft.trim()} busy={rewriting} onPress={() => void rewriteDraft()} />
            </View>
            <AttachmentPickerButton cameraOnly disabled={sending || picking || rewriting || closing || privateMode} onPick={file => { setAttachment(file); setError(''); }} onPicking={setPicking} onError={setError} />
          </>}
          {(!privateMode && !draft.trim() && !attachment || recordingActive) ? <VoiceRecorder disabled={sending || picking || rewriting || closing || !draftReady} onRecorded={setAttachment} onSend={sendVoice} onBusyChange={recordingBusy} onError={setError} />
            : <IconButton name="send" label={privateMode ? 'Enviar mensagem privada' : attachment ? 'Enviar anexo' : 'Enviar mensagem'} light onPress={() => void send()} busy={sending} disabled={picking || rewriting || closing || !draftReady || (!draft.trim() && !attachment)} />}
        </View>
        <ComposerPanel panel={panel} snapClosed={keyboardOpen}>{visiblePanel => visiblePanel === 'actions'
          ? <ComposerMenu disabled={sending || picking || rewriting || closing} privateMode={privateMode} signature={includeSignature} isGroup={group}
            onMedia={chooseMedia} onPoll={() => setPanel('poll')} onPrivate={togglePrivate} onSignature={setIncludeSignature} onCloseTicket={closeTicket} />
          : <PollComposer onSend={sendPoll} onClose={() => setPanel('actions')} />}</ComposerPanel>
      </View>}
      {searching && !keyboardOpen && <View style={{ height: insets.bottom }} />}
      {messageMenu && menuMessage && <MessageActionsMenu key={menuMessage.id} message={menuMessage} anchor={messageMenu.anchor} reduceMotion={reduceMotion} contactName={displayName} contactPhoto={displayPhoto} isGroup={group}
        onClose={() => setMessageMenu(null)} onReply={reply}
        onUpdate={updated => { if (updated.contactId === contactId) setMessages(current => mergeMessages(current, [updated])); }}
        onDelete={(id, scope, deletedAt) => {
          setMessages(current => scope === 'me' ? current.filter(message => message.id !== id) : current.map(message => message.id === id ? { ...message, deletedAt: deletedAt ?? new Date().toISOString() } : message));
          setReplyTo(current => current?.id === id ? null : current);
        }} />}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000' }, keyboardContainer: { backgroundColor: '#242424' }, list: { flex: 1 },
  header: { flexDirection: 'row', gap: 4, alignItems: 'center', minHeight: 68, paddingLeft: 2, paddingRight: 8, paddingVertical: 8, backgroundColor: '#080808', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  contactName: { color: colors.text, fontSize: 16, fontWeight: '600', lineHeight: 23 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  messages: { paddingHorizontal: 8, paddingVertical: 10, gap: 9 },
  composerArea: { backgroundColor: '#242424' }, composer: { paddingHorizontal: 8, paddingTop: 8, flexDirection: 'row', gap: 4, alignItems: 'flex-end' }, uploadStatus: { color: colors.muted, fontSize: 12, paddingHorizontal: 12, paddingTop: 6 },
  privateNotice: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 }, privateText: { flex: 1, color: '#d8b4fe', fontSize: 12 }, privateField: { backgroundColor: '#3b2c49' },
  messageField: { flex: 1, minWidth: 0, minHeight: 38, marginVertical: 3, borderRadius: 24, backgroundColor: '#3a3a3c', flexDirection: 'row', alignItems: 'flex-end' },
  draft: { flex: 1, minWidth: 0, maxHeight: 128, minHeight: 38, backgroundColor: 'transparent', paddingVertical: 8, paddingHorizontal: 12, borderWidth: 0, fontSize: 16, lineHeight: 22 },
  searchPanel: { padding: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, borderRadius: 24 }, searchStatus: { color: colors.muted, fontSize: 12, lineHeight: 18 }, highlight: { borderRadius: 12, backgroundColor: '#ffffff14', paddingVertical: 4 },
  date: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, marginVertical: 16, borderRadius: 12, backgroundColor: '#18181b' }, dateText: { color: colors.muted, fontSize: 11 },
});

function dateKey(value: string) { return new Date(value).toLocaleDateString('en-CA'); }
function dateLabel(value: string) {
  if (dateKey(value) === dateKey(new Date().toISOString())) return 'Hoje';
  if (dateKey(value) === dateKey(new Date(Date.now() - 86400000).toISOString())) return 'Ontem';
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
