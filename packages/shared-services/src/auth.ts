import { portalMismatchMessage, type PortalKey } from '@cagupta/shared-constants';
import { PERMISSIONS, SUPER_ADMIN_EMAIL } from '@cagupta/shared-constants';
import type { ApiClient, SessionStorageAdapter } from './createApiClient.js';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
  initials?: string;
  is_active?: boolean;
  can_change_password?: boolean;
  avatar_url?: string | null;
  portal_theme?: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface AuthOptions {
  portal?: PortalKey;
  identifier?: string;
}

export interface CreateAuthServiceConfig {
  api: ApiClient;
  storage: SessionStorageAdapter;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getInitials?: (name: string) => string;
  mockMode?: boolean;
  mockOtp?: string;
}

function maskEmail(email: string): string {
  const [local, domain] = (email || '').split('@');
  if (!local || !domain) return email;
  const len = local.length;
  const masked = len <= 2
    ? local[0] + '*'.repeat(Math.max(1, len - 1))
    : local[0] + '*'.repeat(len - 2) + local[len - 1];
  return `${masked}@${domain}`;
}

export function createAuthService(config: CreateAuthServiceConfig) {
  const { api, storage, baseUrl, fetchImpl = fetch, mockMode = false, mockOtp = '123456' } = config;
  const getInitials = config.getInitials ?? ((name: string) => name.slice(0, 2).toUpperCase());

  async function saveSession(token: string, user: AuthUser): Promise<AuthSession> {
    await storage.setToken(token);
    await storage.setUser(user);
    return { token, user };
  }

  async function persistSession(
    token: string,
    user: AuthUser,
    portal?: PortalKey,
  ): Promise<AuthSession> {
    const mismatch = portal ? portalMismatchMessage(portal, user) : '';
    if (mismatch) {
      throw new Error(mismatch);
    }
    return saveSession(token, user);
  }

  function buildMockUser(name: string, email: string, role: string | null = null): AuthUser {
    const effectiveRole = email === SUPER_ADMIN_EMAIL ? 'super_admin' : (role || 'viewer');
    return {
      id: 0,
      name,
      email,
      role: effectiveRole,
      permissions: PERMISSIONS[effectiveRole] || [],
      initials: getInitials(name),
      is_active: true,
      can_change_password: true,
    };
  }

  async function loginWithPassword(
    email: string,
    password: string,
    options: AuthOptions = {},
  ): Promise<AuthSession | { otpRequired: true; maskedEmail: string }> {
    const portal = options.portal || 'staff';
    const identifier = options.identifier || email;

    if (!mockMode) {
      const data = await api.postPublic<{ token?: string; user?: AuthUser; otp_required?: boolean; masked_email?: string }>(
        '/auth/login',
        { email, password, portal, identifier },
      );
      if (data.data?.otp_required) {
        return { otpRequired: true, maskedEmail: data.data.masked_email || email };
      }
      return persistSession(data.data!.token!, data.data!.user!, portal);
    }

    return { otpRequired: true, maskedEmail: maskEmail(email) };
  }

  async function requestEmailOtp(email: string, options: AuthOptions = {}): Promise<void> {
    const portal = options.portal || 'staff';
    const identifier = options.identifier || email;
    if (!mockMode) {
      await api.postPublic('/auth/request-otp', { email, portal, identifier });
    }
  }

  async function verifyEmailOtp(email: string, otp: string, options: AuthOptions = {}): Promise<AuthSession> {
    const portal = options.portal || 'staff';
    const identifier = options.identifier || email;

    if (!mockMode) {
      const data = await api.postPublic<{ token: string; user: AuthUser }>(
        '/auth/verify-otp',
        { email, otp, portal, identifier },
      );
      return persistSession(data.data!.token, data.data!.user, portal);
    }

    if (otp !== mockOtp) throw new Error('Invalid OTP. (Hint: use 123456 in dev mode)');
    const name = email.split('@')[0];
    return persistSession('mock-email-token', buildMockUser(name, email), portal);
  }

  async function fetchCurrentUser(token: string): Promise<AuthUser | null> {
    if (!token) return null;
    if (mockMode) {
      return (await storage.getUser()) as AuthUser | null;
    }
    try {
      const data = await api.get<AuthUser>('/auth/me');
      return data.data ?? null;
    } catch {
      return null;
    }
  }

  async function logoutFromServer(token: string | null): Promise<void> {
    if (!token || mockMode) return;
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
  }

  async function logout(): Promise<void> {
    await storage.removeToken();
    await storage.removeUser();
  }

  async function getStoredSession(): Promise<AuthSession | null> {
    const token = await storage.getToken();
    const user = await storage.getUser() as AuthUser | null;
    if (!token || !user) return null;
    return { token, user };
  }

  async function updateProfile(fields: {
    name?: string;
    avatar_url?: string | null;
    portal_theme?: string;
  }): Promise<AuthUser> {
    if (mockMode) {
      const stored = await getStoredSession();
      if (!stored?.user) throw new Error('Not logged in');
      const next = { ...stored.user };
      if (fields.name !== undefined) {
        const n = String(fields.name).trim();
        if (!n) throw new Error('Name cannot be empty.');
        next.name = n;
      }
      if (fields.avatar_url !== undefined) {
        next.avatar_url = fields.avatar_url === '' || fields.avatar_url == null
          ? null
          : fields.avatar_url;
      }
      if (fields.portal_theme !== undefined) {
        next.portal_theme = fields.portal_theme;
      }
      await saveSession(stored.token, next);
      return next;
    }
    const data = await api.patch<AuthUser>('/auth/me', fields);
    if (!data.data) throw new Error('Could not update profile.');
    return data.data;
  }

  async function changePassword(creds: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    if (mockMode) {
      if ((creds.newPassword || '').length < 8) {
        throw new Error('New password must be at least 8 characters.');
      }
      return;
    }
    await api.post('/auth/change-password', {
      current_password: creds.currentPassword,
      new_password: creds.newPassword,
    });
  }

  return {
    loginWithPassword,
    requestEmailOtp,
    verifyEmailOtp,
    fetchCurrentUser,
    logoutFromServer,
    logout,
    getStoredSession,
    saveSession,
    buildMockUser,
    maskEmail,
    updateProfile,
    changePassword,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
