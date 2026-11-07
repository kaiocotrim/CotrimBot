import { useLayoutEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../lib/use-reduced-motion';

export function AnimatedUnreadBadge({ count }: { count: number }) {
  const label = count > 99 ? '99+' : String(count);
  const [frame, setFrame] = useState({ label, previous: label });
  const [progress] = useState(() => new Animated.Value(1));
  const reducedMotion = useReducedMotion();
  if (frame.label !== label) setFrame({ label, previous: frame.label });

  useLayoutEffect(() => {
    if (reducedMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 240, easing: Easing.out(Easing.cubic),
      useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [label, reducedMotion, progress]);

  if (count <= 0) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.badge}>
    <Animated.Text style={[styles.number, {
      opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }]}>{label}</Animated.Text>
    {frame.previous !== '0' && frame.previous !== label && <Animated.View style={[StyleSheet.absoluteFill, styles.previous, {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }],
    }]}><Animated.Text style={styles.number}>{frame.previous}</Animated.Text></Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -5, right: -12, minWidth: 18, minHeight: 18, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 12, backgroundColor: '#7646af', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  number: { color: '#ffffff', fontSize: 10, lineHeight: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  previous: { alignItems: 'center', justifyContent: 'center' },
});
