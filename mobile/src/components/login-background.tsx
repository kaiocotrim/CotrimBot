import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const cards = [
  require('../../assets/login/collage-02.png'),
  require('../../assets/login/collage-04.png'),
  require('../../assets/login/collage-05.png'),
  require('../../assets/login/collage-06.png'),
];

// Reuse the PWA's collage artwork behind the native login form.
export function LoginBackground() {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <View style={styles.collage}>
      {[0, 1, 2].map(column => <View key={column} style={[styles.column, column % 2 === 1 && { marginTop: -100 }]}>
        {[0, 1, 2, 3].map(row => <Image key={row} source={cards[(row + column) % cards.length]} style={styles.card} />)}
      </View>)}
    </View>
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs><LinearGradient id="loginFade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#000" stopOpacity=".25" />
        <Stop offset=".25" stopColor="#000" stopOpacity=".55" />
        <Stop offset=".52" stopColor="#000" stopOpacity=".96" />
        <Stop offset=".7" stopColor="#000" stopOpacity="1" />
      </LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#loginFade)" />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  collage: { position: 'absolute', top: -130, left: '50%', marginLeft: -420, width: 840, flexDirection: 'row', gap: 18, transform: [{ rotate: '20deg' }], opacity: .55 },
  column: { width: 268, gap: 18 },
  card: { width: 268, height: 201, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff14' },
});
