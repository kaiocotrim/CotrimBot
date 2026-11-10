import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon, type IconName } from './ui';
import type { AttachmentKind } from './composer-preview';

const media = [
  { key: 'image', label: 'Fotos', icon: 'image', color: '#54a5ff' },
  { key: 'video', label: 'Vídeo', icon: 'video', color: '#c4a9ff' },
  { key: 'audio', label: 'Áudio', icon: 'music', color: '#26d8a4' },
  { key: 'document', label: 'Documento', icon: 'document', color: '#11bce5' },
] as const;

export function ComposerMenu({ disabled, privateMode, signature, isGroup, onMedia, onPoll, onPrivate, onSignature, onCloseTicket }: {
  disabled: boolean; privateMode: boolean; signature: boolean; isGroup: boolean;
  onMedia: (kind: AttachmentKind) => void; onPoll: () => void; onPrivate: () => void;
  onSignature: (value: boolean) => void; onCloseTicket: () => void;
}) {
  function tile(label: string, icon: IconName, color: string, onPress: () => void, unavailable = false, selected = false) {
    return <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: disabled || unavailable }}
      disabled={disabled || unavailable} onPress={onPress} style={({ pressed }) => [styles.tile, (pressed || disabled || unavailable) && { opacity: .45 }]}>
      <View style={[styles.symbol, selected && { backgroundColor: '#49315d' }]}><Icon name={icon} size={25} color={color} /></View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>;
  }
  return <ScrollView style={styles.panel} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.handle} />
    <View style={styles.grid}>
      {media.map(item => tile(item.label, item.icon, item.color, () => onMedia(item.key), privateMode))}
      {tile('Enquete', 'poll', '#f7b93e', onPoll, privateMode)}
      {tile('Mensagem privada', 'lock', privateMode ? '#d8b4fe' : '#d4d4d8', onPrivate, false, privateMode)}
    </View>
    <View style={styles.signature}><Text style={styles.setting}>Assinar mensagens</Text><Switch accessibilityLabel="Assinar mensagens" value={signature} disabled={disabled} onValueChange={onSignature} trackColor={{ false: '#48484c', true: '#00b98b' }} thumbColor="#ffffff" /></View>
    <Pressable accessibilityRole="button" disabled={disabled || isGroup} onPress={onCloseTicket} style={({ pressed }) => [styles.close, (pressed || disabled || isGroup) && { opacity: .45 }]}>
      <Icon name="bot" size={20} color="#f2a0a4" /><Text style={styles.closeText}>Encerrar chamado com Bot</Text>
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  panel: { maxHeight: 340, marginHorizontal: 8, marginTop: 8, borderRadius: 28, backgroundColor: '#1e1e1f' },
  content: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 22 },
  handle: { width: 30, height: 4, borderRadius: 2, backgroundColor: '#555558', alignSelf: 'center', marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, paddingBottom: 20 },
  tile: { width: '25%', minHeight: 72, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  symbol: { width: 52, height: 42, borderRadius: 24, backgroundColor: '#2d2d30', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#f4f4f5', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  signature: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ffffff16', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, gap: 12 },
  setting: { color: '#d4d4d8', fontSize: 13, flex: 1 },
  close: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, minHeight: 48 },
  closeText: { color: '#f2a0a4', fontSize: 13, flexShrink: 1 },
});
