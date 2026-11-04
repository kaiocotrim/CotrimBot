import { useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { Message, UploadAttachment } from '../lib/types';
import { messagePreview } from '../lib/message-composer';
import { colors, Icon, IconButton } from './ui';
import { AudioControl } from './message-audio';

export function AttachmentPickerButton({ disabled, onPick, onError, onPicking }: {
  disabled: boolean; onPick: (file: UploadAttachment) => void; onError: (message: string) => void; onPicking: (busy: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const lock = useRef(false);
  async function pick(kind: 'image' | 'document') {
    if (lock.current || disabled) return;
    lock.current = true; setPicking(true); onPicking(true);
    try {
      if (kind === 'image') {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: .85, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
        if (result.canceled || !result.assets?.[0]) return;
        const image = result.assets[0];
        onPick({ uri: image.uri, name: image.fileName || `foto-${Date.now()}.jpg`, mimeType: image.mimeType || 'image/jpeg', size: image.fileSize });
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        const document = result.assets[0];
        onPick({ uri: document.uri, name: document.name, mimeType: document.mimeType || 'application/octet-stream', size: document.size });
      }
    } catch { onError('Não foi possível selecionar o arquivo. Tente novamente.'); }
    finally { lock.current = false; setPicking(false); onPicking(false); }
  }
  return <IconButton name="plus" label="Anexar foto ou documento" disabled={disabled || picking} busy={picking} onPress={() => Alert.alert('Anexar', 'Selecione o que deseja enviar.', [
    { text: 'Foto da galeria', onPress: () => void pick('image') },
    { text: 'Documento', onPress: () => void pick('document') },
    { text: 'Cancelar', style: 'cancel' },
  ])} />;
}

export function ComposerPreview({ reply, replyName, attachment, disabled, onCancelReply, onRemoveAttachment }: {
  reply: Message | null; replyName: string; attachment: UploadAttachment | null; disabled: boolean; onCancelReply: () => void; onRemoveAttachment: () => void;
}) {
  if (!reply && !attachment) return null;
  return <View style={styles.root}>
    {reply && <View style={styles.reply}><View style={styles.copy}><Text style={styles.label}>Respondendo a {replyName}</Text><Text numberOfLines={2} style={styles.text}>{messagePreview(reply)}</Text></View><IconButton name="close" label="Cancelar resposta" plain disabled={disabled} onPress={onCancelReply} /></View>}
    {attachment && <View style={styles.file}>
      {attachment.mimeType.startsWith('image/') ? <Image source={{ uri: attachment.uri }} style={styles.thumbnail} resizeMode="cover" accessibilityLabel="Foto selecionada para envio" /> : <View style={styles.thumbnail}><Icon name="archive" color={colors.muted} /></View>}
      <View style={styles.copy}><Text numberOfLines={2} style={styles.text}>{attachment.name}</Text><Text style={styles.label}>{attachment.size !== undefined ? `${(attachment.size / 1024 / 1024).toFixed(1)} MB · ` : ''}Pronto para enviar</Text></View>
      <IconButton name="close" label="Remover anexo" plain disabled={disabled} onPress={onRemoveAttachment} />
    </View>}
    {attachment?.mimeType.startsWith('audio/') && <AudioControl key={attachment.uri} source={{ uri: attachment.uri }} />}
  </View>;
}

const styles = StyleSheet.create({
  root: { padding: 10, paddingBottom: 4, gap: 8 }, reply: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, borderLeftColor: '#d4d4d8', borderRadius: 12, backgroundColor: '#18181b', paddingLeft: 12 },
  copy: { flex: 1, gap: 4, paddingVertical: 8 }, label: { color: colors.muted, fontSize: 12 }, text: { color: colors.text, fontSize: 13, lineHeight: 18 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, backgroundColor: '#18181b' }, thumbnail: { width: 54, height: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27272a' },
});
