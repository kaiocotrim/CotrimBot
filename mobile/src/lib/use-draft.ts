import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDraftStore } from './drafts';

const drafts = createDraftStore(AsyncStorage);

export function useDraft(key: string) {
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    void drafts.read(key).then(value => { if (active && revision.current === 0) setText(value); })
      .catch(() => { if (active) setError('Não foi possível recuperar o rascunho salvo.'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [key]);

  const update = useCallback((value: string) => {
    const version = ++revision.current;
    setText(value); setSaving(true);
    void drafts.write(key, value).then(() => { if (revision.current === version) setError(''); })
      .catch(() => { if (revision.current === version) setError('Não foi possível salvar o rascunho neste aparelho.'); })
      .finally(() => { if (revision.current === version) setSaving(false); });
  }, [key]);
  return { text, update, ready, saving, error };
}
