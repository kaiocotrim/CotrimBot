import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type TextInputProps, type TextInputInstance, type StyleProp, type ViewStyle, TextInput } from 'react-native';
import { useEffect, useRef, useState, type Ref } from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAccount } from '../lib/session';
import { imageSource } from '../lib/images';

export const colors = {
  background: '#09090b', surface: '#18181b', border: '#ffffff18', text: '#f4f4f5',
  muted: '#a1a1aa', accent: '#e4e4e7', error: '#fda4af', outgoing: '#27272a',
};

export type IconName = 'search' | 'back' | 'send' | 'archive' | 'chat' | 'user' | 'logout' | 'eye' | 'eyeOff' | 'close' | 'pin' | 'chevron' | 'info' | 'more' | 'checks' | 'plus' | 'reply' | 'play' | 'pause' | 'mic' | 'stop' | 'groups' | 'contacts' | 'sparkles' | 'camera' | 'image' | 'video' | 'music' | 'document' | 'poll' | 'lock' | 'bot' | 'trash' | 'audioSend' | 'copy' | 'translate' | 'emoji' | 'forward' | 'star';
const paths: Record<IconName, string> = {
  copy: 'M9 9h12v12H9zM5 15H3V3h12v2',
  translate: 'M2 5h12M8 3v2M4 5c1 6 4 8 8 10M12 5c-1 5-4 8-9 11M13 21l4-10 4 10M15 17h4',
  emoji: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 14s1.5 3 4 3 4-3 4-3M8 9h.01M16 9h.01',
  forward: 'M15 3l6 6-6 6M21 9H9a6 6 0 0 0-6 6v6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  audioSend: 'm4 3 17 9-17 9 3-9zM7 12h14',
  image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M3 16l6-6 4 4 3-3 5 5M8 7h.01',
  video: 'M3 5h12v14H3zM15 10l6-4v12l-6-4',
  music: 'M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3M21 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3',
  document: 'M14 2H4v20h16V8zM14 2v6h6M8 12h8M8 16h6',
  poll: 'M4 21V10M10 21V3M16 21v-7M2 21h20',
  lock: 'M6 10h12a2 2 0 0 1 2 2v8H4v-8a2 2 0 0 1 2-2M8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  bot: 'M5 7h14a2 2 0 0 1 2 2v10H3V9a2 2 0 0 1 2-2M12 7V3M8 12h.01M16 12h.01M8 16h8M1 11v5M23 11v5',
  sparkles: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4M22 4h-4',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  groups: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  contacts: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M7 18v-1a5 5 0 0 1 10 0v1M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  search: 'm21 21-4.35-4.35', back: 'm15 18-6-6 6-6', send: 'm5 12 7-7 7 7M12 5v14',
  archive: 'M4 7v13h16V7M10 12h4', chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2', logout: 'M9 21H4V3h5M10 12h11m-4-4 4 4-4 4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12',
  eyeOff: 'm3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 3.8M6.3 6.3A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.7-1.7',
  close: 'm6 6 12 12M6 18 18 6', pin: 'm16 3 5 5-5 2-2 4-4 2-2-2 2-4 4-2zM2 22l6-6', chevron: 'm9 6 6 6-6 6',
  info: 'M12 11v6M12 7h.01', more: 'M12 5h.01M12 12h.01M12 19h.01', checks: 'm2 12 4 4L16 6m-6 8 2 2L22 6',
  plus: 'M12 5v14M5 12h14', reply: 'm9 10-5 4 5 4M4 14h9a6 6 0 0 0 0-12',
  play: 'm8 4 12 8-12 8z', pause: 'M8 4v16M16 4v16', stop: 'M5 5h14v14H5z', mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
};
export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d={paths[name]} />
    {name === 'chat' && <><Circle cx={8} cy={11} r={.7} fill={color} strokeWidth={0} /><Circle cx={12} cy={11} r={.7} fill={color} strokeWidth={0} /><Circle cx={16} cy={11} r={.7} fill={color} strokeWidth={0} /></>}
    {name === 'sparkles' && <Circle cx={4} cy={20} r={2} />}
    {name === 'search' && <Circle cx={10.5} cy={10.5} r={7} />}
    {name === 'user' && <Circle cx={13} cy={7} r={4} />}
    {name === 'eye' && <Circle cx={12} cy={12} r={3} />}
    {name === 'archive' && <Rect x={3} y={3} width={18} height={4} rx={1} />}
    {name === 'info' && <Circle cx={12} cy={12} r={9} />}
  </Svg>;
}
export function IconButton({ name, label, onPress, light = false, plain = false, disabled = false, busy = false, iconSize = 22, iconColor, onLongPress }: {
  name: IconName; label: string; onPress: () => void; light?: boolean; plain?: boolean; disabled?: boolean; busy?: boolean; iconSize?: number; iconColor?: string; onLongPress?: (anchor: { x: number; y: number }) => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onPress} delayLongPress={400} onLongPress={onLongPress ? event => onLongPress({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }) : undefined}
    style={({ pressed }) => [ui.iconButton, light && { backgroundColor: colors.accent }, plain && { backgroundColor: 'transparent' }, (pressed || disabled || busy) && { opacity: .45 }]}>
    {busy ? <ActivityIndicator color={iconColor ?? (light ? colors.background : colors.text)} /> : <Icon name={name} size={iconSize} color={iconColor ?? (light ? colors.background : colors.text)} />}
  </Pressable>;
}
export function Avatar({ name, uri, size = 48, contactId }: { name: string; uri?: string | null; size?: number; contactId?: number }) {
  const { account } = useAccount();
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<{ original?: string | null; uri: string | null } | null>(null);
  const attempted = useRef(new Set<string>());
  const source = account ? imageSource(account.api, refreshed?.original === uri && refreshed ? refreshed.uri : uri) : undefined;
  useEffect(() => {
    if (!account || !contactId) return;
    const original = imageSource(account.api, uri);
    if (original && original.uri !== failed) return;
    const key = `${contactId}:${uri ?? ''}`;
    if (attempted.current.has(key)) return;
    attempted.current.add(key);
    let active = true;
    void account.api.request<{ profilePictureUrl: string | null }>(`/contacts/${contactId}/avatar${original ? '?refresh=1' : ''}`)
      .then(result => { if (active) setRefreshed({ original: uri, uri: result.profilePictureUrl }); })
      .catch(() => {});
    return () => { active = false; };
  }, [account, contactId, uri, failed]);
  return <View accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#3f3f46', alignItems: 'center', justifyContent: 'center' }}>
    {source && source.uri !== failed ? <Image source={source} style={{ width: size, height: size }} onError={() => setFailed(source.uri)} />
      : <Text style={{ color: colors.text, fontSize: size * .37, fontWeight: '600' }}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>}
  </View>;
}

export function Field({ inputRef, ...props }: TextInputProps & { inputRef?: Ref<TextInputInstance> }) {
  return <TextInput ref={inputRef} placeholderTextColor={colors.muted} {...props} style={[ui.input, props.style]} />;
}

export function Button({ label, onPress, busy = false, secondary = false, disabled = false, style }: {
  label: string; onPress: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy || disabled} onPress={onPress}
    style={({ pressed }) => [ui.button, secondary && ui.secondary, style, (pressed || busy || disabled) && { opacity: 0.55 }]}>
    {busy ? <ActivityIndicator color={secondary ? colors.text : colors.background} />
      : <Text style={[ui.buttonText, secondary && { color: colors.text }]}>{label}</Text>}
  </Pressable>;
}

export function ErrorNotice({ message }: { message: string }) {
  if (!message) return null;
  return <Text accessibilityRole="alert" style={ui.error}>{message}</Text>;
}

export function Loading() {
  return <View style={ui.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 16 },
  title: { color: colors.text, fontSize: 28, fontWeight: '600', letterSpacing: -.84 },
  text: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  input: { color: colors.text, backgroundColor: '#1b1b1d', borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12, fontSize: 16, minHeight: 48 },
  button: { borderRadius: 999, backgroundColor: colors.accent, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff0f', alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '700' },
  error: { color: colors.error, padding: 12, lineHeight: 20 },
});
