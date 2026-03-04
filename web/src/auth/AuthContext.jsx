import { createContext, useContext, useState, useCallback } from 'react';
import { logout as serviceLogout, getStoredSession } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession());

  /** Called after any successful login to push session into context. */
  const login = useCallback((token, user) => {
    setSession({ token, user });
  }, []);

  /** Clear session from context AND from localStorage. */
  const logout = useCallback(() => {
    serviceLogout();
    setSession(null);
  }, []);

  const isAuthenticated = Boolean(session?.token);

  return (
    <AuthContext.Provider value={{ session, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook for accessing the auth context in any component. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
