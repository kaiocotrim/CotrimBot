import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAccount } from '../lib/session';
import { messageImageSource } from '../lib/images';
import type { MediaItem, MediaPage } from '../lib/types';
import { Button, colors, ErrorNotice, Icon, ui } from './ui';
import { MessageImage } from './message-image';

type Tab = 'media' | 'documents' | 'links';
export function ContactMediaBrowser({ contactId }: { contactId: number }) {
  const [tab, setTab] = useState<Tab>('media');
  return <View style={ui.screen}>
    <View style={styles.tabs}>{([['media', 'Mídia'], ['links', 'Links'], ['documents', 'Docs']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.selected]}><Text style={{ color: tab === value ? colors.text : colors.muted }}>{label}</Text></Pressable>)}</View>
    <MediaList key={`${contactId}:${tab}`} contactId={contactId} tab={tab} />
  </View>;
}

function MediaList({ contactId, tab }: { contactId: number; tab: Tab }) {
  const { account } = useAccount();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState<MediaPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState<number | null>(null);
  const requestLock = useRef(false);
  const fileLock = useRef(false);
  const tileSize = Math.max(64, Math.floor((width - 48) / 3));

  useEffect(() => {
    if (!account) return;
    let active = true;
    void account.api.media(contactId, tab).then(result => { if (active) { setPage(result); setError(''); } })
      .catch(failure => { if (active) setError(failure.message || 'Não foi possível carregar a biblioteca.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account, contactId, tab, retry]);

  async function older() {
    if (!account || !page?.nextCursor || loading || requestLock.current) return;
    requestLock.current = true; setLoading(true);
    try {
      const next = await account.api.media(contactId, tab, page.nextCursor);
      setPage(current => ({ ...next, items: [...new Map([...(current?.items ?? []), ...next.items].map(item => [item.id, item])).values()] })); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar mais itens.'); }
    finally { setLoading(false); requestLock.current = false; }
  }

  async function openFile(item: MediaItem) {
    if (!account || fileLock.current) return;
    fileLock.current = true; setOpening(item.id); setError('');
    let downloaded: File | undefined;
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('A abertura de arquivos não está disponível neste aparelho.');
      const source = messageImageSource(account.api, item.id);
      const folder = new Directory(Paths.cache, 'cotrimbot-media'); folder.create({ idempotent: true, intermediates: true });
      const filename = (item.fileName || (item.type === 'VIDEO' ? `video-${item.id}.mp4` : `documento-${item.id}`)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160);
      downloaded = await File.downloadFileAsync(source.uri, new File(folder, `${item.id}-${filename}`), { headers: source.headers, idempotent: true });
      await Sharing.shareAsync(downloaded.uri, { mimeType: item.mimeType || undefined, dialogTitle: item.fileName || 'Abrir arquivo' });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível abrir o arquivo.'); }
    finally { try { if (downloaded?.exists) downloaded.delete(); } catch {} setOpening(null); fileLock.current = false; }
  }

  return <View style={{ flex: 1 }}>
    <ErrorNotice message={error} />
    {!!error && !page && <Button label="Tentar novamente" secondary onPress={() => { setError(''); setLoading(true); setRetry(value => value + 1); }} />}
    <FlatList data={page?.items ?? []} keyExtractor={item => String(item.id)} numColumns={tab === 'media' ? 3 : 1}
      contentContainerStyle={styles.content} columnWrapperStyle={tab === 'media' ? styles.gridRow : undefined}
      ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} /> : !error ? <Text style={styles.empty}>Nenhum item compartilhado nesta categoria.</Text> : undefined}
      ListFooterComponent={page?.hasMore ? <Button label="Carregar mais" secondary busy={loading} onPress={() => void older()} /> : undefined}
      renderItem={({ item }) => item.type === 'IMAGE' ? <MessageImage id={item.id} thumbnailSize={tileSize} />
        : item.type === 'TEXT' ? <View style={styles.linkCard}>{item.links.map(link => <Pressable key={link} accessibilityRole="link" onPress={() => { if (/^https?:\/\//i.test(link)) void Linking.openURL(link).catch(() => setError('Não foi possível abrir o link.')); }} style={styles.link}><Text style={styles.linkText}>{link}</Text><Icon name="chevron" size={16} color={colors.muted} /></Pressable>)}</View>
          : <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${item.type === 'VIDEO' ? 'vídeo' : 'documento'}: ${item.fileName || item.content}`} disabled={opening !== null} onPress={() => void openFile(item)} style={[styles.file, item.type === 'VIDEO' && { width: tileSize, height: tileSize, justifyContent: 'center' }]}>
            {opening === item.id ? <ActivityIndicator color={colors.accent} /> : <Icon name="archive" size={24} color={colors.muted} />}
            <Text numberOfLines={2} style={styles.fileName}>{item.fileName || (item.type === 'VIDEO' ? 'Vídeo' : item.content || 'Documento')}</Text>
            {item.type === 'DOCUMENT' && <Text style={styles.fileHint}>Toque para abrir ou salvar</Text>}
          </Pressable>} />
  </View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, padding: 16 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.border }, selected: { backgroundColor: '#3f3f46' },
  content: { padding: 16, gap: 8 }, gridRow: { gap: 8 }, empty: { color: colors.muted, textAlign: 'center', paddingVertical: 36 },
  file: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 8 }, fileName: { color: colors.text, fontSize: 13 }, fileHint: { color: colors.muted, fontSize: 11 },
  linkCard: { backgroundColor: colors.surface, borderRadius: 12 }, link: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, minHeight: 48 }, linkText: { color: colors.text, flex: 1, fontSize: 14 },
});
