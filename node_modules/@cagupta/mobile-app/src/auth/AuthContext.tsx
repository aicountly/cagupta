import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { hasAnyPermission, hasPermission } from '@cagupta/shared-constants';
import type { AuthUser } from '@cagupta/shared-services';
import { authService } from '../adapters/apiClient';
import { setUnauthorizedHandler } from '../adapters/unauthorizedHandler';

interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await authService.getStoredSession();
      if (!stored?.token) {
        if (!cancelled) setLoading(false);
        return;
      }
      const user = await authService.fetchCurrentUser(stored.token);
      if (cancelled) return;
      if (user) {
        await authService.saveSession(stored.token, user);
        setSession({ token: stored.token, user });
      } else {
        await authService.logout();
        setSession(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback((token: string, user: AuthUser) => {
    setSession({ token, user });
  }, []);

  const updateUser = useCallback(async (user: AuthUser) => {
    setSession((s) => {
      if (!s?.token) return s;
      void authService.saveSession(s.token, user);
      return { token: s.token, user };
    });
  }, []);

  const logout = useCallback(async () => {
    await authService.logoutFromServer(session?.token ?? null);
    await authService.logout();
    setSession(null);
  }, [session?.token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const checkPermission = useCallback(
    (permission: string) => hasPermission(session?.user?.permissions, permission),
    [session],
  );

  const checkAnyPermission = useCallback(
    (permissions: string[]) => hasAnyPermission(session?.user?.permissions, permissions),
    [session],
  );

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: Boolean(session?.token),
      login,
      logout,
      updateUser,
      hasPermission: checkPermission,
      hasAnyPermission: checkAnyPermission,
    }),
    [session, loading, login, logout, updateUser, checkPermission, checkAnyPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
