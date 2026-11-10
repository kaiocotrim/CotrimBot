import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccount } from '../lib/session';
import type { Contact, Message } from '../lib/types';
import { Avatar, Button, colors, ErrorNotice, IconButton } from './ui';
import { ChatMessage } from './chat-message';

export function ConversationPreview({ contact, onClose, onOpen }: {
  contact: Contact; onClose: () => void; onOpen: () => void;
}) {
  const { account } = useAccount();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const name = contact.name || contact.phone;

  useEffect(() => {
    if (!account) return;
    let active = true;
    // Fetching history is read-only. Read receipts belong to the full chat screen.
    void account.api.messages(contact.id).then(page => {
      if (active) { setMessages([...page.messages].sort((a, b) => b.id - a.id)); setError(''); }
    }).catch(failure => {
      if (active) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a prévia.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account, contact.id, retry]);

  return <Modal transparent visible animationType="fade" presentationStyle="overFullScreen"
    statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Fechar prévia" onPress={onClose} />
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[styles.card, { height: Math.max(160, Math.min(height * .72, height - insets.top - insets.bottom - 32)) }]}>
        <View style={styles.header}>
          <Avatar name={name} uri={contact.profilePictureUrl} size={42} contactId={contact.id} />
          <View style={styles.heading}>
            <Text numberOfLines={1} style={styles.name}>{name}</Text>
            <Text style={styles.subtitle}>Prévia{contact.unreadCount > 0 ? ` · ${contact.unreadCount} não lida${contact.unreadCount === 1 ? '' : 's'}` : ''}</Text>
          </View>
          <IconButton name="close" label="Fechar prévia" onPress={onClose} plain />
        </View>
        <View style={styles.history}>
          {loading ? <View style={styles.center}><ActivityIndicator color={colors.accent} /><Text style={styles.subtitle}>Carregando prévia…</Text></View>
            : error ? <View style={styles.center}><ErrorNotice message={error} /><Button label="Tentar novamente" secondary onPress={() => { setLoading(true); setError(''); setRetry(value => value + 1); }} /></View>
              : <FlatList inverted data={messages} keyExtractor={item => String(item.id)} initialNumToRender={8}
                contentContainerStyle={[styles.messages, !messages.length && { flexGrow: 1 }]}
                ListEmptyComponent={<View style={styles.center}><Text style={styles.subtitle}>Nenhuma mensagem por aqui.</Text></View>}
                ListFooterComponent={messages.length ? <Text style={styles.historyHint}>Mensagens recentes</Text> : undefined}
                renderItem={({ item }) => <ChatMessage message={item} contactName={name} contactPhoto={contact.profilePictureUrl ?? undefined} isGroup={contact.isGroup} />} />}
        </View>
        <View style={styles.footer}><Button label="Abrir conversa" onPress={onOpen} /></View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 480, borderRadius: 28, overflow: 'hidden', backgroundColor: '#101012', boxShadow: '0 16px 48px #00000088' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ffffff18' },
  heading: { flex: 1, gap: 4 },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 12 },
  history: { flex: 1, backgroundColor: '#080809' },
  messages: { padding: 12, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 },
  historyHint: { color: colors.muted, fontSize: 11, textAlign: 'center', paddingVertical: 8 },
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ffffff18' },
});
