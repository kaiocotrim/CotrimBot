import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert, Animated, AppState, Easing, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import Svg, { Rect } from 'react-native-svg';
import type { UploadAttachment } from '../lib/types';
import { audioFocus, audioTime } from '../lib/audio-focus';
import { recordingAttachment, recordingLevel } from '../lib/recording-preview';
import { colors, Icon } from './ui';
import { RecordingMotionButton } from './recording-motion-button';
import { useReducedMotion } from '../lib/use-reduced-motion';

type Finish = 'preview' | 'send' | 'discard';
const emptyWave = () => Array.from({ length: 48 }, () => 3);
const tap = () => { void Haptics.selectionAsync().catch(() => {}); };

export function VoiceRecorder({ disabled, onRecorded, onSend, onBusyChange, onError }: {
  disabled: boolean; onRecorded: (file: UploadAttachment) => void; onSend: (file: UploadAttachment) => Promise<void>;
  onBusyChange: (busy: boolean) => void; onError: (error: string) => void;
}) {
  const owner = useId();
  const reduceMotion = useReducedMotion();
  const [panelProgress] = useState(() => new Animated.Value(1));
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 100);
  const cue = useAudioPlayer(require('../../assets/sounds/record-start.wav'), { updateInterval: 50 });
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [levels, setLevels] = useState(emptyWave);
  const pausedRef = useRef(false);
  const focused = useRef(false);
  const active = useRef(false);
  const lock = useRef(false);
  const observedRecording = useRef(false);
  const lastDuration = useRef(0);
  const ownsSession = useRef(false);
  const cancelCue = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!recording) return;
    if (reduceMotion) { panelProgress.setValue(1); return; }
    const animation = Animated.timing(panelProgress, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [recording, reduceMotion, panelProgress]);

  const finish = useCallback(async (mode: Finish) => {
    if (lock.current || !active.current) return;
    lock.current = true; active.current = false; setWorking(true);
    let file: UploadAttachment | null = null;
    try {
      const duration = Math.max(recorder.getStatus().durationMillis, lastDuration.current);
      try { await recorder.stop(); } catch (failure) { if (!recorder.uri) throw failure; }
      if (mode !== 'discard' && focused.current) file = recordingAttachment(recorder.uri, duration);
      else if (recorder.uri) { const discarded = new File(recorder.uri); if (discarded.exists) discarded.delete(); }
    } catch (failure) { if (focused.current) onError(failure instanceof Error ? failure.message : 'Não foi possível finalizar a gravação.'); }
    finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      audioFocus.finishRecording(owner); ownsSession.current = false; observedRecording.current = false; pausedRef.current = false;
      setWorking(false); setRecording(false); setPaused(false); onBusyChange(false);
      lock.current = false;
    }
    if (file && focused.current) {
      onRecorded(file);
      if (mode === 'send') await onSend(file);
    }
  }, [recorder, owner, onRecorded, onSend, onError, onBusyChange]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; cancelCue.current?.(); void finish('discard'); };
  }, [finish]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') { cancelCue.current?.(); void finish('preview'); }
    });
    return () => subscription.remove();
  }, [finish]);
  useEffect(() => {
    if (state.durationMillis > lastDuration.current) lastDuration.current = state.durationMillis;
    if (state.isRecording) {
      observedRecording.current = true;
      if (active.current && !pausedRef.current) setLevels(current => [...current.slice(1), recordingLevel(state.metering)]);
    } else if (observedRecording.current && active.current && !pausedRef.current) void finish('preview');
  }, [state.isRecording, state.durationMillis, state.metering, finish]);

  async function playCue() {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false });
      if (!focused.current || AppState.currentState !== 'active') return;
      await cue.seekTo(0);
      await new Promise<void>(resolve => {
        let done = false;
        const complete = () => {
          if (done) return;
          done = true; clearTimeout(timer); subscription.remove();
          try { cue.pause(); } catch {}
          cancelCue.current = null; resolve();
        };
        const subscription = cue.addListener('playbackStatusUpdate', status => {
          if (status.didJustFinish || status.error) complete();
        });
        const timer = setTimeout(complete, 250);
        cancelCue.current = complete;
        cue.play();
      });
    } catch { /* Feedback must never prevent a recording. */ }
  }

  async function start() {
    if (lock.current || active.current || disabled) return;
    panelProgress.setValue(reduceMotion ? 1 : 0);
    lock.current = true; setWorking(true); setRecording(true); setPaused(false); setLevels(emptyWave()); onBusyChange(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      audioFocus.startRecording(owner); ownsSession.current = true;
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microfone desativado', 'Permita o acesso ao microfone para gravar áudios.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Abrir ajustes', onPress: () => void Linking.openSettings().catch(() => onError('Não foi possível abrir os ajustes.')) }]);
        return;
      }
      if (!focused.current || AppState.currentState !== 'active') return;
      await playCue();
      if (!focused.current || AppState.currentState !== 'active') return;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: false, shouldPlayInBackground: false });
      if (!focused.current) return;
      await recorder.prepareToRecordAsync();
      if (!focused.current || AppState.currentState !== 'active') { await recorder.stop().catch(() => {}); return; }
      lastDuration.current = 0; observedRecording.current = false; pausedRef.current = false;
      recorder.record(); active.current = true;
    } catch (failure) { if (focused.current) onError(failure instanceof Error ? failure.message : 'Não foi possível iniciar a gravação.'); }
    finally {
      if (!active.current) {
        if (ownsSession.current) { await setAudioModeAsync({ allowsRecording: false }).catch(() => {}); audioFocus.finishRecording(owner); ownsSession.current = false; }
        setRecording(false); onBusyChange(false);
      }
      if (focused.current) setWorking(false);
      lock.current = false;
    }
  }

  function togglePause() {
    if (lock.current || !active.current) return;
    tap();
    try {
      if (pausedRef.current) { recorder.record(); pausedRef.current = false; setPaused(false); }
      else { pausedRef.current = true; recorder.pause(); setPaused(true); }
    } catch { pausedRef.current = false; setPaused(false); onError('Não foi possível pausar ou continuar o áudio.'); }
  }

  if (!recording) return <RecordingMotionButton label="Gravar áudio" style={styles.microphone} disabled={disabled || working} onPress={() => void start()}><Icon name="mic" size={25} color={colors.background} /></RecordingMotionButton>;
  return <Animated.View style={[styles.panel, {
    opacity: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [.7, 1] }),
    transform: [{ translateY: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }]}>
    <View style={styles.top}>
      <Text accessibilityLabel={`Tempo de gravação ${audioTime(state.durationMillis / 1000)}`} style={styles.time}>{audioTime(state.durationMillis / 1000)}</Text>
      <View style={styles.wave} accessibilityLabel={paused ? 'Gravação pausada' : 'Nível do microfone'}>
        <Svg width="100%" height={40} viewBox="0 0 240 40" preserveAspectRatio="none">
          {levels.map((height, index) => <Rect key={index} x={index * 5} y={(40 - height) / 2} width={3} height={height} rx={1.5} fill="#b3b3b8" />)}
        </Svg>
      </View>
    </View>
    <View style={styles.controls}>
      <RecordingMotionButton label="Apagar gravação" disabled={working} onPress={() => { tap(); void finish('discard'); }} style={styles.control}><Icon name="trash" size={22} /></RecordingMotionButton>
      <RecordingMotionButton label={paused ? 'Continuar gravação' : 'Pausar gravação'} disabled={working} onPress={togglePause} hitSlop={4} style={[styles.pause, working && { opacity: .45 }]}>
        <Icon name={paused ? 'mic' : 'pause'} size={19} color="#ff536e" />
      </RecordingMotionButton>
      <RecordingMotionButton label="Enviar áudio" disabled={working} onPress={() => { tap(); void finish('send'); }} style={[styles.send, working && { opacity: .45 }]}><Icon name="audioSend" size={22} color={colors.background} /></RecordingMotionButton>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  microphone: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  panel: { flex: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  time: { color: '#f4f4f5', fontSize: 26, fontWeight: '300', fontVariant: ['tabular-nums'] },
  wave: { flex: 1, height: 40 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pause: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#ff536e', alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e4e4e7', alignItems: 'center', justifyContent: 'center' },
});
