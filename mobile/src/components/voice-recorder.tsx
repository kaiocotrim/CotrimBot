import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';
import type { UploadAttachment } from '../lib/types';
import { audioFocus, audioTime } from '../lib/audio-focus';
import { colors, IconButton } from './ui';

export function VoiceRecorder({ disabled, onRecorded, onBusyChange, onError }: {
  disabled: boolean; onRecorded: (file: UploadAttachment) => void; onBusyChange: (busy: boolean) => void; onError: (error: string) => void;
}) {
  const owner = useId();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 });
  const state = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const focused = useRef(false);
  const active = useRef(false);
  const lock = useRef(false);
  const observedRecording = useRef(false);
  const lastDuration = useRef(0);
  const ownsSession = useRef(false);

  const finish = useCallback(async (keep: boolean) => {
    if (lock.current || !active.current) return;
    lock.current = true; active.current = false; setWorking(true);
    try {
      const duration = Math.max(recorder.getStatus().durationMillis, lastDuration.current);
      try { await recorder.stop(); } catch (failure) { if (!recorder.uri) throw failure; }
      if (keep && focused.current) {
        if (duration < 300 || !recorder.uri) throw new Error('O áudio ficou muito curto. Grave novamente.');
        onRecorded({ uri: recorder.uri, name: `audio-${Date.now()}.m4a`, mimeType: 'audio/mp4' });
      }
      if (!keep && recorder.uri) { const discarded = new File(recorder.uri); if (discarded.exists) discarded.delete(); }
    } catch (failure) { if (focused.current) onError(failure instanceof Error ? failure.message : 'Não foi possível finalizar a gravação.'); }
    finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      audioFocus.finishRecording(owner); ownsSession.current = false; observedRecording.current = false;
      setWorking(false); setRecording(false); onBusyChange(false);
      lock.current = false;
    }
  }, [recorder, owner, onRecorded, onError, onBusyChange]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; void finish(false); };
  }, [finish]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') void finish(true); });
    return () => subscription.remove();
  }, [finish]);
  useEffect(() => {
    if (state.durationMillis > lastDuration.current) lastDuration.current = state.durationMillis;
    if (state.isRecording) observedRecording.current = true;
    else if (observedRecording.current && active.current) void finish(true);
  }, [state.isRecording, state.durationMillis, finish]);

  async function start() {
    if (lock.current || active.current || disabled) return;
    lock.current = true; setWorking(true); onBusyChange(true);
    try {
      audioFocus.startRecording(owner);
      ownsSession.current = true;
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microfone desativado', 'Permita o acesso ao microfone para gravar áudios.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Abrir ajustes', onPress: () => void Linking.openSettings().catch(() => onError('Não foi possível abrir os ajustes.')) }]);
        return;
      }
      if (!focused.current || AppState.currentState !== 'active') return;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: false, shouldPlayInBackground: false });
      if (!focused.current) return;
      await recorder.prepareToRecordAsync();
      if (!focused.current || AppState.currentState !== 'active') return;
      lastDuration.current = 0; observedRecording.current = false;
      recorder.record(); active.current = true; setRecording(true);
    } catch (failure) { if (focused.current) onError(failure instanceof Error ? failure.message : 'Não foi possível iniciar a gravação.'); }
    finally {
      if (!active.current) {
        if (ownsSession.current) { await setAudioModeAsync({ allowsRecording: false }).catch(() => {}); audioFocus.finishRecording(owner); ownsSession.current = false; }
        onBusyChange(false);
      }
      if (focused.current) setWorking(false);
      lock.current = false;
    }
  }

  if (!recording) return <IconButton name="mic" label="Gravar áudio" disabled={disabled} busy={working} onPress={() => void start()} />;
  return <View style={styles.row}>
    <IconButton name="close" label="Descartar gravação" disabled={working} onPress={() => void finish(false)} />
    <View style={styles.copy}><Text style={styles.recording}>● Gravando {audioTime(state.durationMillis / 1000)}</Text><Text style={styles.hint}>Pare para ouvir antes de enviar</Text></View>
    <IconButton name="stop" label="Parar e revisar áudio" busy={working} onPress={() => void finish(true)} />
  </View>;
}

const styles = StyleSheet.create({ row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, copy: { flex: 1 }, recording: { color: '#f87171', fontSize: 14 }, hint: { color: colors.muted, fontSize: 11, marginTop: 4 } });
