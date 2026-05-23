/** Portal color themes — soft, professional palettes. */

export const DEFAULT_THEME_ID = 'classic_orange';

export const PORTAL_THEMES = {
  classic_orange: {
    id: 'classic_orange',
    label: 'Classic Orange',
    description: 'Default CA Office theme',
    primary: '#F37920',
    primaryLight: '#f5a623',
    primaryTint: '#FEF0E6',
    primaryRgb: '243, 121, 32',
    bg: '#F6F7FB',
    surface: '#ffffff',
    border: '#E6E8F0',
  },
  sage_mist: {
    id: 'sage_mist',
    label: 'Sage Mist',
    description: 'Muted green with warm gray tones',
    primary: '#5B8C6A',
    primaryLight: '#7aa888',
    primaryTint: '#EEF4F0',
    primaryRgb: '91, 140, 106',
    bg: '#F5F7F5',
    surface: '#ffffff',
    border: '#E6E8F0',
  },
  slate_blue: {
    id: 'slate_blue',
    label: 'Slate Blue',
    description: 'Soft corporate blue',
    primary: '#5B7C9D',
    primaryLight: '#7a96b3',
    primaryTint: '#EEF2F7',
    primaryRgb: '91, 124, 157',
    bg: '#F4F6F9',
    surface: '#ffffff',
    border: '#E6E8F0',
  },
  warm_clay: {
    id: 'warm_clay',
    label: 'Warm Clay',
    description: 'Cozy terracotta warmth',
    primary: '#B87D6A',
    primaryLight: '#c99888',
    primaryTint: '#F9F0EC',
    primaryRgb: '184, 125, 106',
    bg: '#F7F5F3',
    surface: '#ffffff',
    border: '#E6E8F0',
  },
  soft_lilac: {
    id: 'soft_lilac',
    label: 'Soft Lilac',
    description: 'Gentle plum accent',
    primary: '#7B6B8A',
    primaryLight: '#9585a3',
    primaryTint: '#F3F0F5',
    primaryRgb: '123, 107, 138',
    bg: '#F6F4F7',
    surface: '#ffffff',
    border: '#E6E8F0',
  },
};

export const PORTAL_THEME_LIST = Object.values(PORTAL_THEMES);

export function isValidThemeId(id) {
  return typeof id === 'string' && id in PORTAL_THEMES;
}

export function resolveThemeId(id) {
  return isValidThemeId(id) ? id : DEFAULT_THEME_ID;
}

/** Apply CSS custom properties on document root. */
export function applyPortalTheme(themeId) {
  const theme = PORTAL_THEMES[resolveThemeId(themeId)];
  const root = document.documentElement;
  root.style.setProperty('--portal-primary', theme.primary);
  root.style.setProperty('--portal-primary-light', theme.primaryLight);
  root.style.setProperty('--portal-primary-tint', theme.primaryTint);
  root.style.setProperty('--portal-primary-rgb', theme.primaryRgb);
  root.style.setProperty('--portal-bg', theme.bg);
  root.style.setProperty('--portal-surface', theme.surface);
  root.style.setProperty('--portal-border', theme.border);
  root.dataset.portalTheme = theme.id;
  return theme.id;
}

export function getStoredThemeForUser(userId) {
  if (userId == null) return null;
  try {
    const raw = localStorage.getItem(`portal_theme_${userId}`);
    return raw && isValidThemeId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setStoredThemeForUser(userId, themeId) {
  if (userId == null) return;
  try {
    localStorage.setItem(`portal_theme_${userId}`, resolveThemeId(themeId));
  } catch {
    // ignore quota errors
  }
}

/** Resolve theme from user object and localStorage fallback. */
export function resolveUserTheme(user) {
  if (user?.portal_theme && isValidThemeId(user.portal_theme)) {
    return user.portal_theme;
  }
  const stored = getStoredThemeForUser(user?.id);
  if (stored) return stored;
  return DEFAULT_THEME_ID;
}

/** Apply theme synchronously before React mount to reduce flash. */
export function bootstrapPortalTheme() {
  try {
    const userRaw = localStorage.getItem('auth_user');
    if (userRaw) {
      const user = JSON.parse(userRaw);
      applyPortalTheme(resolveUserTheme(user));
      return;
    }
  } catch {
    // fall through
  }
  applyPortalTheme(DEFAULT_THEME_ID);
}
