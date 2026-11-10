import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, ErrorNotice, Field, IconButton } from './ui';
import { preparePoll } from '../lib/poll-composer';

export function PollComposer({ onSend, onClose }: { onSend: (poll: ReturnType<typeof preparePoll>) => Promise<void>; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    try {
      const poll = preparePoll(question, options, multiple);
      lock.current = true; setBusy(true); setError('');
      await onSend(poll);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível enviar a enquete.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <ScrollView style={styles.panel} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.row}><Text style={styles.title}>Nova enquete</Text><IconButton name="close" label="Cancelar enquete" plain disabled={busy} onPress={onClose} /></View>
    <Field accessibilityLabel="Pergunta da enquete" placeholder="Pergunta" maxLength={255} value={question} onChangeText={setQuestion} editable={!busy} />
    {options.map((value, index) => <View key={index} style={styles.row}><Field style={{ flex: 1 }} accessibilityLabel={`Opção ${index + 1}`} placeholder={`Opção ${index + 1}`} maxLength={100} value={value} editable={!busy} onChangeText={text => setOptions(current => current.map((option, position) => position === index ? text : option))} />{options.length > 2 && <IconButton name="close" label={`Remover opção ${index + 1}`} plain disabled={busy} onPress={() => setOptions(current => current.filter((_, position) => position !== index))} />}</View>)}
    {options.length < 12 && <Button label="Adicionar opção" secondary disabled={busy} onPress={() => setOptions(current => [...current, ''])} />}
    <View style={styles.row}><Text style={styles.setting}>Permitir múltiplas respostas</Text><Switch accessibilityLabel="Permitir múltiplas respostas" value={multiple} onValueChange={setMultiple} disabled={busy} /></View>
    <ErrorNotice message={error} />
    <Button label="Enviar enquete" onPress={() => void submit()} busy={busy} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  panel: { maxHeight: 340, margin: 8, borderRadius: 24, backgroundColor: '#1e1e1f' },
  content: { padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: '#f4f4f5', fontSize: 17, fontWeight: '600' },
  setting: { flex: 1, color: '#d4d4d8', fontSize: 13 },
});
