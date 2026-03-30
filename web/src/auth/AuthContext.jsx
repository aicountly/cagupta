import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  logout as serviceLogout,
  logoutFromServer,
  getStoredSession,
  fetchCurrentUser,
} from '../services/authService';
import { hasPermission } from '../constants/roles';
import { API_BASE_URL } from '../constants/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession());
  // Loading is true only when we have a stored token to validate against the backend
  const [loading, setLoading] = useState(() => {
    if (!API_BASE_URL) return false;
    return Boolean(localStorage.getItem('auth_token'));
  });

  /**
   * On app load, validate the stored token against the backend.
   * This catches tokens that were revoked server-side.
   */
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (!API_BASE_URL || !storedToken) {
      return;
    }

    fetchCurrentUser(storedToken)
      .then((user) => {
        if (user) {
          localStorage.setItem('auth_user', JSON.stringify(user));
          setSession({ token: storedToken, user });
        } else {
          // Token is invalid — clear session
          serviceLogout();
          setSession(null);
        }
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => setLoading(false));
    // On mount only — runs once to validate the stored token on startup
  }, []);

  /** Called after any successful login to push session into context. */
  const login = useCallback((token, user) => {
    setSession({ token, user });
  }, []);

  /** Clear session from context AND from localStorage; notify the server. */
  const logout = useCallback(() => {
    const token = session?.token;
    logoutFromServer(token);
    serviceLogout();
    setSession(null);
  }, [session]);

  const isAuthenticated = Boolean(session?.token);

  /**
   * Check whether the current user has the given permission.
   * Always returns true for the wildcard '*' (super_admin).
   *
   * @param {string} permission  e.g. 'clients.view'
   * @returns {boolean}
   */
  const checkPermission = useCallback((permission) => {
    return hasPermission(session?.user?.permissions, permission);
  }, [session]);

  return (
    <AuthContext.Provider value={{
      session,
      isAuthenticated,
      loading,
      login,
      logout,
      hasPermission: checkPermission,
    }}>
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
