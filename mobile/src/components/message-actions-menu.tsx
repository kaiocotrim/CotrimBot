import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ChatMessage } from './chat-message';
import { messageMenuLayout, type MessageAnchor } from '../lib/message-menu-layout';
import { useAccount } from '../lib/session';
import { messageActions, messageActionText } from '../lib/message-actions';
import { forwardMessage } from '../lib/forward-message';
import type { Contact, Message } from '../lib/types';
import { Avatar, Button, ErrorNotice, Field, Icon, IconButton, type IconName } from './ui';

export function MessageActionsMenu({ message, anchor, onClose, onReply, onUpdate, onDelete, reduceMotion, contactName, contactPhoto, isGroup }: {
  reduceMotion: boolean; contactName: string; contactPhoto?: string; isGroup: boolean;
  message: Message; anchor: MessageAnchor; onClose: () => void; onReply: (message: Message) => void;
  onUpdate: (message: Message) => void; onDelete: (id: number, scope: 'me' | 'everyone', deletedAt?: string) => void;
}) {
  const { account } = useAccount();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const closing = useRef(false);
  const [exiting, setExiting] = useState(false);
  const [mode, setMode] = useState<'actions' | 'reaction' | 'forward'>('actions');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Contact | null>(null);
  const lock = useRef(false);
  const allowed = messageActions(message);
  const text = messageActionText(message);

  useEffect(() => {
    if (reduceMotion) { progress.setValue(1); return; }
    const animation = Animated.spring(progress, { toValue: 1, damping: 24, stiffness: 300, mass: .7, overshootClamping: true, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, progress]);

  function dismiss(after?: () => void) {
    if (closing.current) return;
    closing.current = true; setExiting(true);
    if (reduceMotion) { onClose(); after?.(); return; }
    Animated.timing(progress, { toValue: 0, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false }).start(({ finished }) => {
      if (finished) { onClose(); after?.(); }
    });
  }

  async function run(action: () => Promise<void>, close = true) {
    if (lock.current || closing.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); if (close) dismiss(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível concluir a ação.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function update(action: () => Promise<Message>) {
    const updated = await action();
    onUpdate({ ...message, ...updated, private: message.private || updated.private, sentByUser: updated.sentByUser ?? message.sentByUser });
  }
  function pin() {
    if (!account) return;
    if (message.pinned) { void run(() => update(() => account.api.messageFlags(message.id, { pinned: false }))); return; }
    Alert.alert('Fixar mensagem', 'Por quanto tempo?', [
      { text: '24 horas', onPress: () => void run(() => update(() => account.api.messageFlags(message.id, { pinned: true, pinDurationHours: 24 }))) },
      { text: '7 dias', onPress: () => void run(() => update(() => account.api.messageFlags(message.id, { pinned: true, pinDurationHours: 168 }))) },
      { text: '30 dias', onPress: () => void run(() => update(() => account.api.messageFlags(message.id, { pinned: true, pinDurationHours: 720 }))) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }
  function remove() {
    if (!account) return;
    const perform = (scope: 'me' | 'everyone') => void run(async () => {
      const result = await account.api.deleteMessage(message.id, scope);
      onDelete(result.messageId, result.scope, result.deletedAt);
    });
    Alert.alert('Apagar mensagem?', 'Escolha quem deixará de ver esta mensagem.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar para mim', style: 'destructive', onPress: () => perform('me') },
      ...(!message.deletedAt && message.direction === 'OUTGOING' ? [{ text: 'Apagar para todos', style: 'destructive' as const, onPress: () => perform('everyone') }] : []),
    ]);
  }
  function beginForward() {
    if (!account) return;
    setMode('forward');
    void run(async () => setContacts(await account.api.contacts()), false);
  }
  const actionRows = Number(allowed.reply) + Number(allowed.copy) + Number(allowed.forward) + Number(allowed.flags) * 2 + Number(allowed.delete);
  const preferredHeight = mode === 'actions' ? Math.min(440, actionRows * 40 + 18 + (error ? 80 : 0) + (busy ? 36 : 0)) : 440;
  const layout = messageMenuLayout(anchor, { width, height, top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right }, message.direction === 'OUTGOING', allowed.react, preferredHeight);
  const opacity = progress;
  const enterScale = progress.interpolate({ inputRange: [0, 1], outputRange: [.94, 1] });
  const menuStyle = { opacity, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale: enterScale }] };
  const filtered = contacts.filter(contact => `${contact.name} ${contact.phone}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));

  return <Modal transparent visible animationType="none" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={() => { if (!busy) dismiss(); }}>
    <View accessibilityViewIsModal style={styles.overlay}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, { opacity }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar opções da mensagem" disabled={busy || exiting} onPress={() => dismiss()} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.highlight, layout.bubble, {
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [anchor.y - layout.bubble.top, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] }) },
        ],
      }]}>
        <ChatMessage message={message} contactName={contactName} contactPhoto={contactPhoto} isGroup={isGroup} standalone />
      </Animated.View>
      {allowed.react && <Animated.View style={[styles.quickReactions, layout.reactions, menuStyle]}>
        {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji, index) => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Reagir com ${emoji}`} disabled={busy || exiting} style={styles.quickEmoji}
          onPress={() => account && void run(() => update(() => account.api.reactToMessage(message.id, emoji)))}>
          <Animated.Text style={[styles.quickEmojiText, { transform: [{ scale: progress.interpolate({ inputRange: [0, Math.min(.8, .15 + index * .09), 1], outputRange: [.6, .85, 1] }) }] }]}>{emoji}</Animated.Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Mais reações" disabled={busy || exiting} style={styles.quickEmoji} onPress={() => setMode('reaction')}><Icon name="plus" size={20} color="#b9b9c0" /></Pressable>
      </Animated.View>}
      <Animated.View onAccessibilityEscape={() => { if (!busy) dismiss(); }} style={[styles.card, layout.menu, menuStyle]}>
        {mode === 'actions' ? <ScrollView keyboardShouldPersistTaps="handled">
          {allowed.reply && <MenuAction label="Responder" icon="reply" disabled={busy || exiting} onPress={() => dismiss(() => onReply(message))} />}
          {allowed.copy && <MenuAction label="Copiar" icon="copy" disabled={busy || exiting} onPress={() => void run(() => Clipboard.setStringAsync(text).then(() => {}))} />}
          {allowed.forward && <MenuAction label="Encaminhar" icon="forward" disabled={busy || exiting} onPress={beginForward} />}
          {allowed.flags && <MenuAction label={message.pinned ? 'Desafixar' : 'Fixar'} icon="pin" disabled={busy || exiting} onPress={pin} />}
          {allowed.flags && <MenuAction label={message.favorited ? 'Desfavoritar' : 'Favoritar'} icon="star" disabled={busy || exiting} onPress={() => account && void run(() => update(() => account.api.messageFlags(message.id, { favorited: !message.favorited })))} />}
          {allowed.delete && <MenuAction label="Apagar" icon="trash" disabled={busy || exiting} destructive onPress={remove} />}
        </ScrollView> : <View style={styles.detail}>
          <View style={styles.heading}><IconButton name="back" label="Voltar às opções" plain disabled={busy || exiting} onPress={() => { setError(''); setMode('actions'); }} /><Text style={styles.title}>{mode === 'reaction' ? 'Reagir' : 'Encaminhar'}</Text><IconButton name="close" label="Fechar opções" plain disabled={busy || exiting} onPress={() => dismiss()} /></View>
          {mode === 'reaction' && <><View style={styles.reactions}>{['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Reagir com ${emoji}`} disabled={busy || exiting} style={styles.emoji} onPress={() => account && void run(() => update(() => account.api.reactToMessage(message.id, emoji)))}><Text style={styles.emojiText}>{emoji}</Text></Pressable>)}</View>{!!message.reaction && <Button label="Remover reação" secondary disabled={busy || exiting} onPress={() => account && void run(() => update(() => account.api.reactToMessage(message.id, '')))} />}</>}
          {mode === 'forward' && <>
            <Field accessibilityLabel="Buscar destino" placeholder="Buscar conversa" value={query} onChangeText={setQuery} editable={!busy} style={styles.search} />
            <FlatList style={styles.destinations} data={filtered} keyExtractor={item => String(item.id)} keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.hint}>{busy ? 'Carregando…' : 'Nenhuma conversa encontrada.'}</Text>}
              renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: target?.id === item.id }} disabled={busy || exiting} onPress={() => setTarget(item)} style={[styles.destination, target?.id === item.id && styles.chosen]}><Avatar name={item.name || item.phone} uri={item.profilePictureUrl} size={30} /><Text numberOfLines={1} style={styles.destinationName}>{item.name || item.phone}</Text></Pressable>} />
            <Button label={target ? `Encaminhar para ${target.name || target.phone}` : 'Selecione uma conversa'} disabled={busy || exiting || !target} onPress={() => account && target && void run(async () => { const result = await forwardMessage(account.api, message, target.id); onUpdate(result.message); })} />
            {!!error && !contacts.length && <Button label="Recarregar conversas" secondary disabled={busy || exiting} onPress={beginForward} />}
          </>}
        </View>}
        {busy && <ActivityIndicator style={styles.busy} color="#d8b4fe" />}
        <ErrorNotice message={error} />
      </Animated.View>
    </View>
  </Modal>;
}

function MenuAction({ label, icon, disabled, onPress, destructive = false }: {
  label: string; icon: IconName; disabled: boolean; onPress: () => void; destructive?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, destructive && styles.divider, (pressed || disabled) && { opacity: .5 }]}>
    <Icon name={icon} size={18} color={destructive ? '#f2a0a4' : '#ededf0'} /><Text style={[styles.actionText, destructive && { color: '#f2a0a4' }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1 }, backdrop: { backgroundColor: '#00000078' },
  highlight: { position: 'absolute', overflow: 'hidden', borderRadius: 22, boxShadow: '0 8px 24px #00000066' },
  quickReactions: { position: 'absolute', height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, borderRadius: 28, backgroundColor: '#1b1b1eea', borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff20', boxShadow: '0 6px 20px #00000055' },
  quickEmoji: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, quickEmojiText: { fontSize: 25 },
  card: { position: 'absolute', backgroundColor: '#18181b', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff24', paddingVertical: 6, overflow: 'hidden', boxShadow: '0 8px 28px #00000066' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, paddingVertical: 8, paddingHorizontal: 14 },
  actionText: { color: '#f4f4f5', fontSize: 14, lineHeight: 20, flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ffffff20', marginTop: 5 },
  detail: { paddingHorizontal: 12, gap: 10, flexShrink: 1 },
  heading: { flexDirection: 'row', alignItems: 'center' }, title: { flex: 1, color: '#f4f4f5', fontSize: 16, fontWeight: '600' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap' }, emoji: { width: '33.3333%', minHeight: 52, alignItems: 'center', justifyContent: 'center' }, emojiText: { fontSize: 29 },
  search: { minHeight: 40, fontSize: 14 }, destinations: { height: 185 }, destination: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, borderRadius: 12, minHeight: 48 },
  destinationName: { color: '#f4f4f5', fontSize: 13, flex: 1 }, chosen: { backgroundColor: '#49315e' }, hint: { color: '#a1a1aa', fontSize: 12, padding: 12 }, busy: { paddingVertical: 10 },
});
