import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from './use-reduced-motion';

export function useSectionTransition(index: number, itemWidth: number) {
  const reduceMotion = useReducedMotion();
  const [offset] = useState(() => new Animated.Value(0));
  const [indicator] = useState(() => new Animated.Value(index * itemWidth));
  const previousIndex = useRef(index);

  useLayoutEffect(() => {
    const previous = previousIndex.current;
    previousIndex.current = index;
    if (reduceMotion) {
      offset.setValue(0);
      return;
    }
    if (previous === index) return;
    offset.setValue(index > previous ? 6 : -6);
    const animation = Animated.timing(offset, {
      toValue: 0, duration: 200, easing: Easing.out(Easing.cubic),
      useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [index, reduceMotion, offset]);

  useLayoutEffect(() => {
    if (reduceMotion || !itemWidth) {
      indicator.setValue(index * itemWidth);
      return;
    }
    const animation = Animated.spring(indicator, {
      toValue: index * itemWidth, damping: 24, stiffness: 240, mass: 0.8,
      overshootClamping: true, useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [index, itemWidth, reduceMotion, indicator]);

  return {
    contentStyle: { transform: [{ translateX: offset }] },
    indicatorStyle: { transform: [{ translateX: indicator }] },
  };
}
