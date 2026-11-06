import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@mythweaver/contracts';
import { ApiError, api } from './http';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: User };

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, displayName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Session lost mid-session (expired cookie, revoked): drop back to anonymous. */
  handleUnauthorized: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then(({ user }) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // 401 is the normal "not signed in" answer; anything else is a real problem and the
        // sign-in screen is still the right place to land.
        void error;
        setState({ status: 'anonymous', user: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    setState({ status: 'authenticated', user });
  }, []);

  const signUp = useCallback(async (email: string, displayName: string, password: string) => {
    const { user } = await api.register(email, displayName, password);
    setState({ status: 'authenticated', user });
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setState({ status: 'anonymous', user: null });
  }, []);

  const handleUnauthorized = useCallback(() => {
    setState({ status: 'anonymous', user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signUp, signOut, handleUnauthorized }),
    [state, signIn, signUp, signOut, handleUnauthorized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/**
 * Turns a thrown failure into a sentence a player can act on. Field-level details win over the
 * generic message, because "Use at least 12 characters" beats "Request validation failed".
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const firstDetail = error.details ? Object.values(error.details)[0]?.[0] : undefined;
    if (firstDetail) return firstDetail;
    if (error.code === 'rate_limited') return 'Too many attempts. Wait a minute and try again.';
    if (error.code === 'unauthorized') return 'That email and password do not match.';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}
