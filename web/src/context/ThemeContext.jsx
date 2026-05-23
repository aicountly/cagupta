import { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { updateCurrentUserProfile } from '../services/authService';
import { API_BASE_URL } from '../constants/config';
import {
  DEFAULT_THEME_ID,
  applyPortalTheme,
  resolveThemeId,
  resolveUserTheme,
  setStoredThemeForUser,
} from '../theme/portalThemes';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { session, user, updateSessionUser } = useAuth();
  const token = session?.token;

  const [themeId, setThemeId] = useState(() => {
    if (user) return resolveUserTheme(user);
    return DEFAULT_THEME_ID;
  });
  const [draftThemeId, setDraftThemeId] = useState(themeId);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    const resolved = user ? resolveUserTheme(user) : DEFAULT_THEME_ID;
    setThemeId(resolved);
    setDraftThemeId(resolved);
    applyPortalTheme(resolved);
  }, [user?.id, user?.portal_theme]);

  useEffect(() => {
    if (!user) {
      applyPortalTheme(DEFAULT_THEME_ID);
    }
  }, [user]);

  const selectTheme = useCallback((id) => {
    const resolved = resolveThemeId(id);
    setDraftThemeId(resolved);
    applyPortalTheme(resolved);
  }, []);

  const resetDraft = useCallback(() => {
    setDraftThemeId(themeId);
    applyPortalTheme(themeId);
  }, [themeId]);

  const saveTheme = useCallback(async (id) => {
    const resolved = resolveThemeId(id ?? draftThemeId);
    if (!user) throw new Error('Sign in to save your theme preference.');

    setSaving(true);
    try {
      if (API_BASE_URL && token) {
        const updated = await updateCurrentUserProfile(token, { portal_theme: resolved });
        updateSessionUser(updated);
      } else {
        setStoredThemeForUser(user.id, resolved);
        updateSessionUser({ portal_theme: resolved });
      }
      setThemeId(resolved);
      setDraftThemeId(resolved);
      applyPortalTheme(resolved);
      return resolved;
    } finally {
      setSaving(false);
    }
  }, [draftThemeId, token, updateSessionUser, user]);

  const isDirty = draftThemeId !== themeId;

  return (
    <ThemeContext.Provider value={{
      themeId,
      draftThemeId,
      isDirty,
      saving,
      selectTheme,
      resetDraft,
      saveTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
