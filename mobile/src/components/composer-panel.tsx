import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { useReducedMotion } from '../lib/use-reduced-motion';
import { Icon } from './ui';

type Panel = 'actions' | 'poll';

export function ComposerToggle({ open, disabled, onPress }: { open: boolean; disabled: boolean; onPress: () => void }) {
  const [rotation] = useState(() => new Animated.Value(open ? 1 : 0));
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) { rotation.setValue(open ? 1 : 0); return; }
    const animation = Animated.timing(rotation, {
      toValue: open ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [open, reduceMotion, rotation]);

  return <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Fechar opções' : 'Mais opções'}
    accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.toggle, (pressed || disabled) && { opacity: .45 }]}>
    <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
      <Icon name="plus" size={28} />
    </Animated.View>
  </Pressable>;
}

export function ComposerPanel({ panel, children, snapClosed = false }: { panel: Panel | null; snapClosed?: boolean; children: (panel: Panel) => ReactNode }) {
  const [displayedPanel, setDisplayedPanel] = useState<Panel>(panel ?? 'actions');
  const [progress] = useState(() => new Animated.Value(panel ? 1 : 0));
  const reduceMotion = useReducedMotion();
  const open = panel !== null;
  if (panel && panel !== displayedPanel) setDisplayedPanel(panel);

  useEffect(() => {
    if (reduceMotion || (!open && snapClosed)) { progress.setValue(open ? 1 : 0); return; }
    // Animate layout height too, so the conversation moves with the opening panel.
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0, duration: open ? 260 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: false, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [open, reduceMotion, progress, snapClosed]);

  return <Animated.View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
    importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={{
      height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 356] }), overflow: 'hidden',
    }}>
    <Animated.View style={[styles.content, {
      opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }]}>{children(displayedPanel)}</Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { height: 356 },
});
