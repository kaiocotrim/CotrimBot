import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, ErrorNotice, Field, Icon, ui } from '../components/ui';
import { useAccount } from '../lib/session';
import { LoginBackground } from '../components/login-background';

export default function Login() {
  const auth = useAccount();
  const [server, setServer] = useState(auth.server);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStep, setPasswordStep] = useState(false);
  const [editingServer, setEditingServer] = useState(!auth.server);

  async function submit() {
    if (busy) return;
    if (!passwordStep) {
      if (!server.trim() || !email.trim()) { setError('Preencha servidor e e-mail para continuar.'); return; }
      setError(''); setPasswordStep(true); return;
    }
    if (!server.trim() || !email.trim() || !password) { setError('Preencha servidor, e-mail e senha.'); return; }
    setBusy(true); setError('');
    try { await auth.signIn(server, email, password); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  return <View style={[ui.screen, styles.page]}><LoginBackground /><SafeAreaView style={styles.safeArea}>
    <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}><Image source={require('../../assets/cotrimbot.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="CotrimBot" /></View>
        <Text style={styles.title}>Converse.{ '\n' }Conquiste.</Text>
        <View style={styles.form}>
          {editingServer && <View style={styles.serverField}>
            <Text style={styles.label}>Servidor CotrimBot</Text>
            <Field accessibilityLabel="Servidor" placeholder="https://chat.suaempresa.com.br" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
          </View>}
          <Field accessibilityLabel="E-mail" placeholder="Seu endereço de e-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy} onSubmitEditing={() => void submit()} returnKeyType="next" />
          {passwordStep && <View style={styles.passwordField}>
            <Field accessibilityLabel="Senha" placeholder="Sua senha" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="current-password" onSubmitEditing={() => void submit()} returnKeyType="go" editable={!busy} autoFocus style={{ paddingRight: 56 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} accessibilityState={{ selected: showPassword }} onPress={() => setShowPassword(value => !value)} style={styles.show}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} color={colors.muted} /></Pressable>
          </View>}
          <ErrorNotice message={error} />
          <Button label={passwordStep ? 'Entrar' : 'Continuar'} onPress={() => void submit()} busy={busy} disabled={!email.trim() || !server.trim() || (passwordStep && !password)} />
        </View>
        <Text style={styles.footer}>Acesse sua conta para continuar no <Text style={{ color: '#d4d4d8', fontWeight: '600' }}>CotrimBot.</Text></Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditingServer(value => !value)} style={styles.serverToggle}><Text style={styles.label}>{editingServer ? 'Ocultar servidor' : 'Alterar servidor'}</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></View>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#000' },
  safeArea: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 32, maxWidth: 408, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', justifyContent: 'center', minHeight: 160, flexGrow: 1, maxHeight: 260 }, logo: { width: 240, height: 140 },
  title: { color: '#ededed', fontSize: 40, fontWeight: '600', lineHeight: 44, letterSpacing: -1, textAlign: 'center', marginBottom: 32 },
  form: { gap: 16 }, label: { color: colors.muted, fontSize: 12 }, serverField: { gap: 8 },
  passwordField: { position: 'relative' }, show: { position: 'absolute', right: 4, top: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: { color: '#909090', textAlign: 'center', fontSize: 12, lineHeight: 20, marginTop: 20 },
  serverToggle: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
