import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../lib/use-reduced-motion';

export function RecordingMotionButton({ label, disabled, onPress, style, children, hitSlop }: {
  label: string; disabled: boolean; onPress: () => void; style: StyleProp<ViewStyle>; children: ReactNode; hitSlop?: number;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const reduceMotion = useReducedMotion();
  useEffect(() => () => scale.stopAnimation(), [scale]);

  function animate(toValue: number) {
    if (reduceMotion) { scale.setValue(1); return; }
    Animated.spring(scale, { toValue, damping: 18, stiffness: 360, mass: .55, useNativeDriver: true, isInteraction: false }).start();
  }

  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      hitSlop={hitSlop} onPressIn={() => animate(.9)} onPressOut={() => animate(1)} onPress={onPress} style={style}>
      {children}
    </Pressable>
  </Animated.View>;
}
