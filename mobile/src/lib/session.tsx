import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Api, ApiError, normalizeServer } from './api';
import type { Session } from './types';

const TOKEN_KEY = 'cotrimbot.token';
const SERVER_KEY = 'cotrimbot.server';
type Account = { api: Api; session: Session };
type AuthState = {
  account: Account | null; ready: boolean; server: string; restoreError: string;
  restore: () => Promise<void>;
  signIn: (server: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const Context = createContext<AuthState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [server, setServer] = useState(process.env.EXPO_PUBLIC_SERVER_URL ?? '');
  const [restoreError, setRestoreError] = useState('');

  const activate = useCallback((api: Api, session: Session) => {
    api.onUnauthorized = () => {
      setAccount(null);
      void SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    };
    setAccount({ api, session });
  }, []);

  const restore = useCallback(async () => {
    try {
      const [savedServer, token] = await Promise.all([
        SecureStore.getItemAsync(SERVER_KEY), SecureStore.getItemAsync(TOKEN_KEY),
      ]);
      setRestoreError('');
      if (savedServer) setServer(savedServer);
      if (savedServer && token) {
        const api = new Api(normalizeServer(savedServer, __DEV__), token);
        const session = await api.request<Session | null>('/auth/get-session');
        if (session) activate(api, session);
        else await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await SecureStore.deleteItemAsync(TOKEN_KEY);
      else setRestoreError(error instanceof Error ? error.message : 'Não foi possível restaurar a sessão.');
    } finally { setReady(true); }
  }, [activate]);

  // Storage restoration updates state only after asynchronous SecureStore reads.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void restore(); }, [restore]);

  async function signIn(input: string, email: string, password: string) {
    const origin = normalizeServer(input, __DEV__);
    const api = new Api(origin);
    const result = await api.signIn(email, password);
    await SecureStore.setItemAsync(SERVER_KEY, origin);
    await SecureStore.setItemAsync(TOKEN_KEY, result.token);
    setServer(origin); setRestoreError('');
    activate(api, result.session);
  }

  async function signOut() {
    const api = account?.api;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAccount(null); setRestoreError('');
    if (api) await api.fetch('/auth/sign-out', { method: 'POST' }).catch(() => {});
  }

  async function retryRestore() { setReady(false); await restore(); }

  return <Context.Provider value={{ account, ready, server, restoreError, restore: retryRestore, signIn, signOut }}>{children}</Context.Provider>;
}

export function useAccount() {
  const state = useContext(Context);
  if (!state) throw new Error('SessionProvider ausente.');
  return state;
}
