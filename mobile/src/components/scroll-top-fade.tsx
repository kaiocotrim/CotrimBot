import type { ComponentRef, ComponentType, ReactElement, RefObject } from 'react';
import { Animated, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

// The library's legacy NativeMethods mixin is incompatible with React Native 0.88 types.
// Its runtime component accepts ViewProps plus the required mask element.
const MaskedView = NativeMaskedView as unknown as ComponentType<ViewProps & { maskElement: ReactElement }>;

export function ScrollTopFade({ target, scrollY }: { target: RefObject<ComponentRef<typeof View> | null>; scrollY: Animated.Value }) {
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.overlay, { opacity: scrollY.interpolate({ inputRange: [0, 20], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
    <MaskedView style={StyleSheet.absoluteFill} maskElement={
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="conversationBlurMask" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="white" stopOpacity={1} />
            <Stop offset="0.25" stopColor="white" stopOpacity={1} />
            <Stop offset="0.6" stopColor="white" stopOpacity={0.65} />
            <Stop offset="1" stopColor="white" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#conversationBlurMask)" />
      </Svg>
    }>
      <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus"
        intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
    </MaskedView>
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="conversationTopFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#080809" stopOpacity={1} />
          <Stop offset="0.3" stopColor="#080809" stopOpacity={0.8} />
          <Stop offset="0.65" stopColor="#080809" stopOpacity={0.3} />
          <Stop offset="1" stopColor="#080809" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#conversationTopFade)" />
    </Svg>
  </Animated.View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 52 },
});
