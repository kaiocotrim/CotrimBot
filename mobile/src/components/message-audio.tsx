import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioSource } from 'expo-audio';
import { audioFocus, audioTime } from '../lib/audio-focus';
import { useAccount } from '../lib/session';
import { messageImageSource } from '../lib/images';
import { colors, IconButton } from './ui';

export function MessageAudio({ id }: { id: number }) {
  const { account } = useAccount();
  return account ? <AudioControl source={messageImageSource(account.api, id)} /> : null;
}

export function AudioControl({ source }: { source: AudioSource }) {
  const id = useId();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [rate, setRate] = useState(1);
  const [trackWidth, setTrackWidth] = useState(160);
  const loaded = useRef(false);
  const operation = useRef(0);
  const lock = useRef(false);
  const pause = useCallback(() => { operation.current++; try { player.pause(); } catch {} }, [player]);

  useFocusEffect(useCallback(() => () => { audioFocus.stop(id); pause(); }, [id, pause]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') { audioFocus.stop(id); pause(); } });
    return () => subscription.remove();
  }, [id, pause]);

  async function toggle() {
    if (lock.current) return;
    if (status.playing) { audioFocus.stop(id); pause(); return; }
    lock.current = true; setStarting(true); setError('');
    const version = ++operation.current;
    try {
      audioFocus.play(id, pause);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false });
      if (version !== operation.current) return;
      if (!loaded.current || status.error) { player.replace(source); loaded.current = true; }
      else if (status.duration > 0 && status.currentTime >= status.duration - .1) await player.seekTo(0);
      if (version !== operation.current) return;
      audioFocus.play(id, pause); player.setPlaybackRate(rate); player.play();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível reproduzir o áudio.'); audioFocus.stop(id); }
    finally { setStarting(false); lock.current = false; }
  }
  async function seek(seconds: number) { try { await player.seekTo(Math.max(0, Math.min(status.duration, seconds))); } catch { setError('Não foi possível avançar o áudio.'); } }
  const percent = status.duration > 0 ? Math.min(100, status.currentTime / status.duration * 100) : 0;

  return <View style={styles.root}>
    <View style={styles.controls}>
      <IconButton name={status.playing ? 'pause' : 'play'} label={status.playing ? 'Pausar áudio' : status.error ? 'Tentar reproduzir áudio novamente' : 'Reproduzir áudio'} busy={starting || status.isBuffering} onPress={() => void toggle()} />
      <View style={styles.timeline}>
        <Pressable accessibilityRole="adjustable" accessibilityLabel="Posição do áudio" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} accessibilityActions={[{ name: 'increment', label: 'Avançar dez segundos' }, { name: 'decrement', label: 'Voltar dez segundos' }]} onAccessibilityAction={event => void seek(status.currentTime + (event.nativeEvent.actionName === 'increment' ? 10 : -10))}
          disabled={!status.isLoaded || status.duration <= 0} onLayout={event => setTrackWidth(event.nativeEvent.layout.width)} onPress={event => void seek(event.nativeEvent.locationX / trackWidth * status.duration)} style={styles.trackTouch}>
          <View style={styles.track}><View style={[styles.progress, { width: `${percent}%` }]} /></View>
        </Pressable>
        <Text style={styles.time}>{audioTime(status.currentTime)} / {audioTime(status.duration)}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Velocidade ${rate} vezes`} style={styles.speed} onPress={() => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; try { player.setPlaybackRate(next); setRate(next); } catch { setError('Não foi possível alterar a velocidade.'); } }}><Text style={styles.speedText}>{rate}×</Text></Pressable>
    </View>
    {!!(error || status.error) && <Text accessibilityRole="alert" style={styles.error}>{error || 'Não foi possível reproduzir este formato de áudio. Toque em reproduzir para tentar novamente.'}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { width: 238, maxWidth: '100%', gap: 4 }, controls: { flexDirection: 'row', alignItems: 'center', gap: 8 }, timeline: { flex: 1, minWidth: 60 }, trackTouch: { minHeight: 28, justifyContent: 'center' }, track: { height: 4, borderRadius: 2, backgroundColor: '#52525b', overflow: 'hidden' }, progress: { height: 4, backgroundColor: '#d4d4d8', borderRadius: 2 },
  time: { color: colors.muted, fontSize: 10 }, speed: { minWidth: 38, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, speedText: { color: colors.text, fontSize: 12, fontWeight: '600' }, error: { color: colors.error, fontSize: 12, lineHeight: 18 },
});
