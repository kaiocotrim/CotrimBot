import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useAccount } from '../lib/session';
import { Button, colors, ErrorNotice, Loading, ui } from '../components/ui';
import { View } from 'react-native';

function Navigation() {
  const { account, ready, restoreError, restore, signOut } = useAccount();
  if (!ready) return <Loading />;
  if (restoreError) return <View style={ui.center}>
    <ErrorNotice message={restoreError} />
    <Button label="Tentar novamente" onPress={() => void restore()} />
    <Button label="Voltar ao login" secondary onPress={() => void signOut()} />
  </View>;
  return <Stack screenOptions={{
    headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text,
    contentStyle: { backgroundColor: colors.background }, headerShadowVisible: false,
  }}>
    <Stack.Protected guard={!account}><Stack.Screen name="login" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={!!account}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="contact/[id]" options={{ headerShown: false }} />
    </Stack.Protected>
  </Stack>;
}

export default function RootLayout() {
  return <SessionProvider><StatusBar style="light" /><Navigation /></SessionProvider>;
}
