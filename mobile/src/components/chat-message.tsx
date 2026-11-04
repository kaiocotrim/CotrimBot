import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Message } from '../lib/types';
import { imageCaption } from '../lib/images';
import { useAccount } from '../lib/session';
import { Avatar, colors, Icon } from './ui';
import { MessageImage } from './message-image';
import { systemMessageLabel } from '../lib/system-message';
import { canReply } from '../lib/message-composer';
import { MessageAudio } from './message-audio';

export function ChatMessage({ message, contactName, contactPhoto, isGroup, onReply }: {
  message: Message; contactName: string; contactPhoto?: string; isGroup: boolean; onReply?: (message: Message) => void;
}) {
  const { account } = useAccount();
  const outgoing = message.direction === 'OUTGOING';
  const author = message.sentByUser ?? (message.sentByUserId === account?.session.user.id ? account?.session.user : null);
  const name = outgoing ? author?.name || 'Equipe' : message.senderName || contactName;
  const photo = outgoing ? author?.image : message.senderProfilePictureUrl || (!isGroup ? contactPhoto : undefined);
  const hasImage = ['IMAGE', 'STICKER'].includes(message.type);
  const content = message.deletedAt ? 'Mensagem apagada' : hasImage ? imageCaption(message.content, message.type) : message.content || `[${message.type.toLowerCase()}]`;

  if (message.type === 'SYSTEM') return <View style={styles.system}><Text style={styles.systemText}>{message.deletedAt ? 'Mensagem apagada' : systemMessageLabel(message.content, account?.session.user.id ?? '')}</Text></View>;

  return <View style={[styles.row, outgoing && styles.outgoing]}>
    <Avatar name={name} uri={photo} size={34} />
    <Pressable onLongPress={onReply && canReply(message) ? () => onReply(message) : undefined} style={[styles.bubble, message.private && styles.private]}>
      {message.private && <Text style={styles.note}>NOTA INTERNA</Text>}
      {isGroup && !outgoing && !!message.senderName && <Text style={styles.sender}>{message.senderName}</Text>}
      {!message.deletedAt && (message.quotedMessageId || message.quotedContent) && <View style={styles.quote}><Text numberOfLines={1} style={styles.quoteName}>{message.quotedSenderName || 'Mensagem citada'}</Text><Text numberOfLines={3} style={styles.quoteText}>{message.quotedContent || 'Mensagem de mídia'}</Text></View>}
      {!message.deletedAt && hasImage && <MessageImage id={message.id} sticker={message.type === 'STICKER'} />}
      {!message.deletedAt && message.type === 'AUDIO' && <MessageAudio id={message.id} />}
      {!!content && (message.type !== 'AUDIO' || !!message.deletedAt || !/^\[(áudio|audio)\]$/i.test(content)) && <Text selectable style={[styles.content, message.private && styles.privateContent, !!message.deletedAt && styles.deleted]}>{content}</Text>}
      {!message.deletedAt && !hasImage && !['TEXT', 'SYSTEM', 'AUDIO'].includes(message.type) && <Text style={styles.media}>Mídia disponível na versão web</Text>}
      <View style={styles.metadata}>
        {onReply && canReply(message) && <Pressable accessibilityRole="button" accessibilityLabel="Responder esta mensagem" hitSlop={10} onPress={() => onReply(message)} style={styles.replyButton}><Icon name="reply" size={16} color={message.private ? '#71717a' : colors.muted} /></Pressable>}
        <Text style={[styles.time, message.private && { color: '#71717a' }]}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
        {outgoing && !message.private && !message.deletedAt && <View accessibilityLabel={message.readAt ? 'Mensagem lida' : 'Mensagem enviada'}><Icon name="checks" size={16} color={message.readAt ? colors.text : colors.muted} /></View>}
      </View>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%' }, outgoing: { flexDirection: 'row-reverse' },
  bubble: { flexShrink: 1, minWidth: 64, maxWidth: '82%', borderRadius: 22, backgroundColor: '#27272a', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 5, gap: 3 },
  content: { color: colors.text, fontSize: 16, lineHeight: 22, flexShrink: 1 },
  private: { backgroundColor: '#f4f4f5' }, privateContent: { color: '#18181b' }, note: { color: '#52525b', fontSize: 10, letterSpacing: 1 },
  sender: { color: '#d4d4d8', fontSize: 12, fontWeight: '600', marginBottom: 2 }, deleted: { fontStyle: 'italic', opacity: .6 },
  metadata: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 20 },
  time: { color: colors.muted, fontSize: 10, lineHeight: 15 }, media: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  system: { alignSelf: 'center', borderRadius: 12, backgroundColor: '#18181b', paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6 }, systemText: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  quote: { borderLeftWidth: 3, borderLeftColor: '#a1a1aa', backgroundColor: '#00000026', borderRadius: 8, padding: 8, gap: 3, marginBottom: 4 }, quoteName: { color: '#d4d4d8', fontSize: 12, fontWeight: '600' }, quoteText: { color: '#a1a1aa', fontSize: 13, lineHeight: 18 }, replyButton: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
});
