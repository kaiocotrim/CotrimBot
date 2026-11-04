import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type TextInputProps, type TextInputInstance, type StyleProp, type ViewStyle, TextInput } from 'react-native';
import { useEffect, useRef, useState, type Ref } from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAccount } from '../lib/session';
import { imageSource } from '../lib/images';

export const colors = {
  background: '#09090b', surface: '#18181b', border: '#ffffff18', text: '#f4f4f5',
  muted: '#a1a1aa', accent: '#e4e4e7', error: '#fda4af', outgoing: '#27272a',
};

export type IconName = 'search' | 'back' | 'send' | 'archive' | 'chat' | 'user' | 'logout' | 'eye' | 'eyeOff' | 'close' | 'pin' | 'chevron' | 'info' | 'more' | 'checks' | 'plus' | 'reply' | 'play' | 'pause' | 'mic' | 'stop';
const paths: Record<IconName, string> = {
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
    {name === 'search' && <Circle cx={10.5} cy={10.5} r={7} />}
    {name === 'user' && <Circle cx={13} cy={7} r={4} />}
    {name === 'eye' && <Circle cx={12} cy={12} r={3} />}
    {name === 'archive' && <Rect x={3} y={3} width={18} height={4} rx={1} />}
    {name === 'info' && <Circle cx={12} cy={12} r={9} />}
  </Svg>;
}
export function IconButton({ name, label, onPress, light = false, plain = false, disabled = false, busy = false }: {
  name: IconName; label: string; onPress: () => void; light?: boolean; plain?: boolean; disabled?: boolean; busy?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [ui.iconButton, light && { backgroundColor: colors.accent }, plain && { backgroundColor: 'transparent' }, (pressed || disabled || busy) && { opacity: .45 }]}>
    {busy ? <ActivityIndicator color={light ? colors.background : colors.text} /> : <Icon name={name} color={light ? colors.background : colors.text} />}
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
