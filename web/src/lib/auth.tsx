import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@wt/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, authApi, refreshFailedOffline, refreshSession, setPasswordChangeRequiredHandler, setSessionExpiredHandler } from './api';
import { forgetOfflineData, lastUser, rememberUser } from './offline';
import { currentPushSubscription } from './pwa';

/** Lepas notifikasi perangkat ini saat keluar agar akun lain di HP yang sama tidak menerimanya. */
async function releasePush() {
  try {
    const sub = await currentPushSubscription();
    if (!sub) return;
    await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    /* abaikan */
  }
}

type AuthState =
  | { status: 'loading'; user: null }
  /** offline: dibuka tanpa internet memakai data terakhir di perangkat (baca saja). */
  | { status: 'authenticated'; user: User; offline?: boolean }
  | { status: 'anonymous'; user: null };

interface AuthContextValue {
  state: AuthState;
  login: (input: { email: string; password: string }) => Promise<User>;
  startDemo: () => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const signedIn = useCallback((user: User) => {
    rememberUser(user);
    setState({ status: 'authenticated', user });
  }, []);
  const signedOut = useCallback(() => {
    setState({ status: 'anonymous', user: null });
    queryClient.clear();
    forgetOfflineData();
  }, [queryClient]);

  useEffect(() => {
    // Pulihkan sesi dari refresh cookie saat aplikasi dibuka.
    void refreshSession().then((user) => {
      if (user) return signedIn(user);
      // Tanpa internet: buka dengan data terakhir di perangkat ini, sesi dicek lagi saat online.
      const cached = refreshFailedOffline() ? lastUser() : null;
      if (cached) setState({ status: 'authenticated', user: cached, offline: true });
      else signedOut();
    });
    setSessionExpiredHandler(signedOut);
    // Jika admin me-reset password saat sesi aktif, arahkan ke halaman ganti password.
    setPasswordChangeRequiredHandler(() =>
      setState((s) => (s.status === 'authenticated' ? { ...s, user: { ...s.user, mustChangePassword: true } } : s)),
    );
    return () => {
      setSessionExpiredHandler(null);
      setPasswordChangeRequiredHandler(null);
    };
  }, [signedIn, signedOut]);

  // Kembali online setelah dibuka offline → pastikan sesi masih berlaku.
  const offline = state.status === 'authenticated' && state.offline;
  useEffect(() => {
    if (!offline) return;
    const check = () =>
      void refreshSession().then((user) => {
        if (user) signedIn(user);
        else if (!refreshFailedOffline()) signedOut();
      });
    window.addEventListener('online', check);
    if (navigator.onLine) check();
    return () => window.removeEventListener('online', check);
  }, [offline, signedIn, signedOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (input) => {
        const user = await authApi.login(input);
        signedIn(user);
        return user;
      },
      startDemo: async () => {
        const user = await authApi.startDemo();
        signedIn(user);
        return user;
      },
      logout: async () => {
        try {
          await releasePush();
          await authApi.logout();
        } finally {
          signedOut();
        }
      },
      setUser: signedIn,
    }),
    [state, signedIn, signedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
