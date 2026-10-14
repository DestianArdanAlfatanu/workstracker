import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@wt/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, refreshSession, setPasswordChangeRequiredHandler, setSessionExpiredHandler } from './api';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
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

  const signedIn = useCallback((user: User) => setState({ status: 'authenticated', user }), []);
  const signedOut = useCallback(() => {
    setState({ status: 'anonymous', user: null });
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    // Pulihkan sesi dari refresh cookie saat aplikasi dibuka.
    void refreshSession().then((user) => (user ? signedIn(user) : signedOut()));
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
