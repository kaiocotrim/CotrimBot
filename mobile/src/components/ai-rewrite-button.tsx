import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../lib/use-reduced-motion';
import { Icon } from './ui';

export function AiRewriteButton({ enabled, busy, onPress }: { enabled: boolean; busy: boolean; onPress: () => void }) {
  const highlighted = enabled || busy;
  const [emphasis] = useState(() => new Animated.Value(highlighted ? 1 : 0));
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) { emphasis.setValue(highlighted ? 1 : 0); return; }
    const animation = Animated.timing(emphasis, {
      toValue: highlighted ? 1 : 0, duration: 280, easing: Easing.out(Easing.cubic),
      useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [highlighted, reduceMotion, emphasis]);

  return <Pressable accessibilityRole="button" accessibilityLabel="Deixar mensagem profissional com IA"
    accessibilityState={{ disabled: !enabled || busy, busy }} disabled={!enabled || busy}
    onPress={onPress} hitSlop={{ left: 4, right: 4, top: 3, bottom: 3 }} style={({ pressed }) => [styles.button, pressed && { opacity: .7 }]}>
    {busy ? <ActivityIndicator size="small" color="#c4b5fd" /> : <View pointerEvents="none" style={styles.icon}>
      <Animated.View style={[styles.layer, { opacity: emphasis.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}><Icon name="sparkles" size={18} color="#8d8797" /></Animated.View>
      <Animated.View style={[styles.layer, { opacity: emphasis }]}><Icon name="sparkles" size={18} color="#c4b5fd" /></Animated.View>
    </View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 18, height: 18 },
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
