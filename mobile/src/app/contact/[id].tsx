import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, colors, ErrorNotice, Field, Icon, IconButton, ui } from '../../components/ui';
import { MessageImage } from '../../components/message-image';
import { ContactMediaBrowser } from '../../components/contact-media-browser';
import { ContactActions } from '../../components/contact-actions';
import { useAccount } from '../../lib/session';
import type { Company, Contact, MediaSummary } from '../../lib/types';

export default function ContactRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContactInfo key={id} id={Number(id)} />;
}

function ContactInfo({ id }: { id: number }) {
  const { account } = useAccount();
  const [contact, setContact] = useState<Contact | null>(null);
  const [summary, setSummary] = useState<MediaSummary | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [companyError, setCompanyError] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', companyName: '', jobTitle: '' });

  useEffect(() => {
    if (!account) return;
    let active = true;
    if (!Number.isSafeInteger(id) || id <= 0) return;
    void account.api.contact(id).then(value => { if (active) { setContact(value); setError(''); } }).catch(failure => { if (active) setError(failure.message || 'Não foi possível carregar o contato.'); });
    void account.api.mediaSummary(id).then(value => { if (active) { setSummary(value); setMediaError(''); } }).catch(() => { if (active) setMediaError('Não foi possível carregar as mídias.'); });
    void account.api.companies().then(value => { if (active) { setCompanies(value.clients ?? []); setCompanyError(''); } }).catch(() => { if (active) setCompanyError('Não foi possível carregar os links e as empresas cadastradas.'); });
    return () => { active = false; };
  }, [account, id, reload]);

  async function save() {
    if (!account || !contact || busy) return;
    const phone = form.phone.replace(/\D/g, '');
    if (!form.name.trim() || (!contact.isGroup && !/^\d{7,15}$/.test(phone))) { setError('Preencha o nome e um telefone com código do país, de 7 a 15 dígitos.'); return; }
    setBusy(true); setError('');
    try {
      const saved = await account.api.updateContact(id, { name: form.name.trim(), companyName: form.companyName.trim(), jobTitle: form.jobTitle.trim(), ...(!contact.isGroup ? { phone } : {}) });
      setContact(current => current ? { ...current, ...saved } : saved); setEditing(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  function close() { if (busy) return; if (mediaOpen) setMediaOpen(false); else if (editing) { setEditing(false); setError(''); } else router.back(); }
  const company = companies.find(item => item.name.toLocaleLowerCase('pt-BR') === contact?.companyName?.toLocaleLowerCase('pt-BR'));
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}><IconButton name={mediaOpen ? 'back' : 'close'} label={mediaOpen ? 'Voltar às informações' : 'Fechar informações'} plain onPress={close} disabled={busy} /><Text style={styles.heading}>{mediaOpen ? 'Mídia, links e docs' : editing ? 'Editar contato' : 'Informações do contato'}</Text></View>
    {mediaOpen ? <ContactMediaBrowser contactId={id} /> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!contact ? <View style={ui.center}>{error ? <><ErrorNotice message={error} /><Button label="Tentar novamente" onPress={() => { setError(''); setReload(value => value + 1); }} /></> : Number.isSafeInteger(id) && id > 0 ? <ActivityIndicator color={colors.accent} /> : <ErrorNotice message="Contato inválido." />}</View> : <>
          <View style={styles.profile}>
            <Avatar name={contact.name} uri={contact.profilePictureUrl} size={112} contactId={id} />
            <Text style={styles.name}>{contact.name}{contact.jobTitle ? <Text style={styles.job}> - {contact.jobTitle}</Text> : null}</Text>
            <Text selectable style={styles.phone}>{contact.phone}</Text>
            {!editing && <Pressable accessibilityRole="button" onPress={() => { setForm({ name: contact.name, phone: contact.phone, companyName: contact.companyName ?? '', jobTitle: contact.jobTitle ?? '' }); setError(''); setEditing(true); }} style={styles.edit}><Text style={styles.editText}>Editar contato</Text></Pressable>}
          </View>
          {editing ? <View style={styles.form}>
            <Text style={ui.muted}>Nome</Text><Field accessibilityLabel="Nome do contato" value={form.name} editable={!busy} maxLength={191} onChangeText={name => setForm(value => ({ ...value, name }))} />
            {!contact.isGroup && <><Text style={ui.muted}>Telefone com código do país</Text><Field accessibilityLabel="Telefone do contato" value={form.phone} editable={!busy} keyboardType="phone-pad" onChangeText={phone => setForm(value => ({ ...value, phone }))} /></>}
            <Text style={ui.muted}>Empresa</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
              {[{ id: 'none', name: '' }, ...companies].map(item => <Pressable key={item.id} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: form.companyName === item.name }} onPress={() => setForm(value => ({ ...value, companyName: item.name }))} style={[styles.choice, form.companyName === item.name && styles.selected]}><Text style={ui.text}>{item.name || 'Sem empresa'}</Text></Pressable>)}
            </ScrollView>
            {!!companyError && <ErrorNotice message={companyError} />}
            <Text style={ui.muted}>Cargo</Text><Field accessibilityLabel="Cargo do contato" value={form.jobTitle} editable={!busy} maxLength={191} onChangeText={jobTitle => setForm(value => ({ ...value, jobTitle }))} />
            <ErrorNotice message={error} /><Button label="Salvar contato" busy={busy} onPress={() => void save()} /><Button label="Cancelar" secondary disabled={busy} onPress={close} />
          </View> : <>
            <View style={styles.section}>
              <Pressable accessibilityRole="button" accessibilityLabel="Abrir mídia, links e documentos" onPress={() => setMediaOpen(true)} style={styles.mediaHeading}><Icon name="chat" size={18} color={colors.muted} /><Text style={styles.mediaLabel}>Mídia, links e docs</Text>{summary && <Text style={ui.muted}>{summary.count}</Text>}<Icon name="chevron" size={16} color={colors.muted} /></Pressable>
              <ScrollView horizontal contentContainerStyle={styles.thumbnails}>
                {summary?.items.map(item => item.type === 'IMAGE' ? <MessageImage key={item.id} id={item.id} thumbnailSize={92} /> : <Pressable key={item.id} accessibilityRole="button" accessibilityLabel="Ver vídeo na biblioteca" onPress={() => setMediaOpen(true)} style={styles.video}><Text style={ui.muted}>Vídeo</Text></Pressable>)}
              </ScrollView>
              {!summary && !mediaError && <ActivityIndicator color={colors.muted} />}
              {summary?.count === 0 && <Text style={ui.muted}>Nenhum conteúdo compartilhado ainda.</Text>}
              <ErrorNotice message={mediaError} />{!!mediaError && <Button label="Tentar novamente" secondary onPress={() => setReload(value => value + 1)} />}
            </View>
            <View style={[styles.section, styles.details]}>
              <Detail label="Tipo" value={contact.isGroup ? 'Grupo' : 'Contato'} />
              <Detail label="Telefone" value={contact.phone} />
              {!!contact.companyName && <View style={styles.detail}><Text style={ui.muted}>Empresa</Text><View style={styles.company}>{!!company?.image && <Avatar name={company.name} uri={company.image} size={30} />}<Text style={styles.value}>{contact.companyName}</Text></View></View>}
              {!!contact.jobTitle && <Detail label="Cargo" value={contact.jobTitle} />}
              {!!company?.links?.length && <View style={styles.detail}><Text style={ui.muted}>Links da empresa</Text>{company.links.map(link => <Pressable key={link} accessibilityRole="link" style={styles.link} onPress={() => { if (/^https?:\/\//i.test(link)) void Linking.openURL(link).catch(() => setError('Não foi possível abrir o link.')); }}><Text style={styles.linkText}>{link}</Text><Icon name="chevron" size={16} color={colors.muted} /></Pressable>)}</View>}
              <ErrorNotice message={companyError} /><ErrorNotice message={error} />
              <ContactActions contact={contact} onChange={updated => setContact(current => current ? { ...current, ...updated } : updated)} />
            </View>
          </>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>}
  </SafeAreaView>;
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={ui.muted}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#09090b' }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, minHeight: 60 }, heading: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }, profile: { alignItems: 'center', paddingTop: 28, paddingBottom: 20 },
  name: { color: colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 20 }, job: { fontWeight: '400', color: colors.muted }, phone: { color: colors.muted, fontSize: 15, marginTop: 8 },
  edit: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 }, editText: { color: '#d4d4d8', fontSize: 14 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: 20 }, mediaHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, mediaLabel: { color: '#d4d4d8', fontSize: 13, fontWeight: '500', flex: 1 }, thumbnails: { gap: 6, paddingTop: 8 }, video: { width: 92, height: 92, backgroundColor: colors.surface, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  details: { gap: 24 }, detail: { gap: 6 }, value: { color: colors.text, fontSize: 16, fontWeight: '500' }, company: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  link: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, minHeight: 44, borderRadius: 14, backgroundColor: '#141416', borderWidth: 1, borderColor: colors.border }, linkText: { color: colors.text, fontSize: 14, flex: 1 },
  form: { gap: 12 }, choices: { gap: 8 }, choice: { padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border }, selected: { backgroundColor: '#3f3f46' },
});
