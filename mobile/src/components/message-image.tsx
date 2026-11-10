import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAccount } from '../lib/session';
import { messageImageSource } from '../lib/images';
import { colors, IconButton } from './ui';

export function MessageImage({ id, sticker = false, thumbnailSize, onLongPress }: { id: number; sticker?: boolean; thumbnailSize?: number; onLongPress?: (anchor: { x: number; y: number }) => void }) {
  const { account } = useAccount();
  const { width, height } = useWindowDimensions();
  const [ratio, setRatio] = useState(sticker ? 1 : 4 / 3);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  if (!account) return null;
  const source = messageImageSource(account.api, id);
  const imageWidth = thumbnailSize ?? Math.max(120, Math.min(width * .82 - 46, sticker ? 180 : 340));
  const imageHeight = thumbnailSize ?? Math.min(imageWidth / ratio, 360);
  return <>
    <Pressable delayLongPress={400} onLongPress={onLongPress ? event => onLongPress({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }) : undefined} accessibilityRole="button" accessibilityLabel={failed ? 'Tentar carregar imagem novamente' : sticker ? 'Abrir figurinha' : 'Abrir imagem'} onPress={() => {
      if (failed) { setFailed(false); setLoading(true); setAttempt(value => value + 1); }
      else if (!loading) setExpanded(true);
    }} style={[styles.preview, { width: imageWidth, height: imageHeight }, sticker && { backgroundColor: 'transparent' }]}>
      {!failed && <Image key={attempt} source={source} resizeMode={thumbnailSize ? 'cover' : 'contain'} style={StyleSheet.absoluteFill} accessibilityLabel={sticker ? 'Figurinha da conversa' : 'Imagem da conversa'}
        onLoad={event => { const size = event.nativeEvent.source; if (size.width > 0 && size.height > 0) setRatio(size.width / size.height); setLoading(false); }}
        onError={() => { setFailed(true); setLoading(false); }} />}
      {loading && <ActivityIndicator color={colors.accent} />}
      {failed && <Text style={styles.error}>Não foi possível carregar a imagem.{ '\n' }Toque para tentar novamente.</Text>}
    </Pressable>
    <Modal visible={expanded} animationType="fade" onRequestClose={() => setExpanded(false)}>
      <SafeAreaProvider style={styles.viewer}>
      <SafeAreaView style={styles.viewer}>
        <View style={styles.toolbar}><Text style={styles.heading}>{sticker ? 'Figurinha' : 'Imagem'}</Text><IconButton name="close" label="Fechar imagem" onPress={() => setExpanded(false)} /></View>
        <ScrollView minimumZoomScale={1} maximumZoomScale={4} centerContent contentContainerStyle={styles.zoom}>
          <Image source={source} resizeMode="contain" style={{ width, height: Math.max(200, height - 160) }} accessibilityLabel="Imagem ampliada" />
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: '#18181b' },
  error: { color: colors.muted, fontSize: 12, textAlign: 'center', padding: 16, lineHeight: 20 },
  viewer: { flex: 1, backgroundColor: '#000' }, toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  heading: { color: colors.text, fontSize: 16 }, zoom: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
});
