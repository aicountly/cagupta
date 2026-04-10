/**
 * authService.js
 *
 * Centralised authentication helpers.  All functions:
 *  - Call the PHP backend when VITE_API_BASE_URL is set.
 *  - Fall back to a safe mock/dev mode otherwise so the UI remains usable
 *    without a backend.
 *
 * ⚠️  MOCK MODE WARNING
 *  Mock mode is only active when VITE_API_BASE_URL is NOT set AND the app is
 *  running in development (import.meta.env.DEV).  Never deploy without setting
 *  VITE_API_BASE_URL in production — failing to do so would allow anyone to
 *  log in with the hardcoded OTP.
 */

import { getInitials } from '../utils/getInitials';
import { SUPER_ADMIN_EMAIL, API_BASE_URL } from '../constants/config';
import { PERMISSIONS } from '../constants/roles';

const API_BASE = API_BASE_URL;
const IS_DEV = import.meta.env.DEV;

/** Persist token + user profile to localStorage and return the pair. */
function saveSession(token, user) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
  return { token, user };
}

/**
 * Parse an API response, throwing a descriptive Error on failure.
 * @param {Response} res
 */
async function parseResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

/**
 * Build a mock user for dev mode.
 * The super-admin email is always given the super_admin role.
 */
function buildMockUser(name, email, role = null) {
  const effectiveRole = email === SUPER_ADMIN_EMAIL ? 'super_admin' : (role || 'viewer');
  return {
    id:                   0,
    name,
    email,
    role:                 effectiveRole,
    permissions:          PERMISSIONS[effectiveRole] || [],
    initials:             getInitials(name),
    is_active:            true,
    can_change_password:  true,
  };
}

/** Exchange a Google ID-token / credential for an app session. */
export async function loginWithGoogle(googleCredential) {
  if (API_BASE) {
    // Decode the Google JWT payload to extract name/email/avatar
    let name = 'Google User';
    let email = '';
    let avatarUrl = '';
    try {
      const payload = JSON.parse(atob(googleCredential.split('.')[1]));
      name      = payload.name  || payload.email || name;
      email     = payload.email || '';
      avatarUrl = payload.picture || '';
    } catch {
      // ignore decode errors
    }

    const res = await fetch(`${API_BASE}/auth/sso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        provider:   'google',
        sso_token:  googleCredential,
        name,
        email,
        avatar_url: avatarUrl,
      }),
    });
    const data = await parseResponse(res);
    return saveSession(data.data.token, data.data.user);
  }

  // ── Mock mode (dev only) ──────────────────────────────────────────────────
  let mockName = 'Google User';
  let mockEmail = 'user@google.com';
  if (IS_DEV) {
    try {
      const payload = JSON.parse(atob(googleCredential.split('.')[1]));
      mockName  = payload.name  || payload.email || mockName;
      mockEmail = payload.email || mockEmail;
    } catch {
      // ignore
    }
  }
  return saveSession('mock-google-token', buildMockUser(mockName, mockEmail));
}

/** Exchange a Microsoft MSAL response for an app session. */
export async function loginWithMicrosoft(msalResponse) {
  const idToken = msalResponse.idToken || '';
  const account = msalResponse.account || {};
  const email   = account.username || account.upn || '';
  const name    = account.name || email || 'Microsoft User';

  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/sso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        provider:  'microsoft',
        sso_token: idToken,
        name,
        email,
      }),
    });
    const data = await parseResponse(res);
    return saveSession(data.data.token, data.data.user);
  }

  // ── Mock mode ────────────────────────────────────────────────────────────
  return saveSession('mock-microsoft-token', buildMockUser(name, email));
}

/**
 * Authenticate with email + password (PHP backend).
 *
 * If the backend returns { otp_required: true }, this function returns
 * { otpRequired: true, maskedEmail } so the caller can show the OTP step.
 * Otherwise it saves the session and returns { token, user } as normal.
 */
export async function loginWithPassword(email, password) {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await parseResponse(res);
    if (data.data?.otp_required) {
      return { otpRequired: true, maskedEmail: data.data.masked_email || email };
    }
    return saveSession(data.data.token, data.data.user);
  }

  // Mock: in dev mode simulate OTP flow
  if (!IS_DEV) throw new Error('Authentication service is not configured.');
  return { otpRequired: true, maskedEmail: maskEmailLocal(email) };
}

/** Ask the backend (or mock) to send an OTP to the given email. */
export async function requestEmailOtp(email) {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/request-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error('Failed to send OTP');
    return;
  }
  // Mock: always succeeds instantly
}

/**
 * Verify the OTP entered by the user.
 *
 * ⚠️  In mock/dev mode "123456" is accepted for any email.
 */
export async function verifyEmailOtp(email, otp) {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, otp }),
    });
    const data = await parseResponse(res);
    return saveSession(data.data.token, data.data.user);
  }

  // ── Mock mode (dev only) ──────────────────────────────────────────────────
  if (!IS_DEV) throw new Error('Authentication service is not configured.');
  if (otp !== '123456') throw new Error('Invalid OTP. (Hint: use 123456 in dev mode)');
  const name = email.split('@')[0];
  return saveSession('mock-email-token', buildMockUser(name, email));
}

/**
 * Fetch the current user profile from the PHP backend.
 * Returns null when the token is missing or invalid.
 *
 * @param {string} token  Bearer token from localStorage.
 * @returns {Promise<object|null>}
 */
export async function fetchCurrentUser(token) {
  if (!token || !API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Update the signed-in user's display name and/or avatar URL.
 *
 * @param {string} token
 * @param {{ name?: string, avatar_url?: string|null }} fields
 * @returns {Promise<object>} Updated user object from API (or merged mock user).
 */
export async function updateCurrentUserProfile(token, fields) {
  const body = {};
  if (fields.name !== undefined) body.name = fields.name;
  if (fields.avatar_url !== undefined) body.avatar_url = fields.avatar_url;

  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method:  'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await parseResponse(res);
    return data.data;
  }

  if (!IS_DEV) throw new Error('Authentication service is not configured.');
  const s = getStoredSession();
  if (!s?.user) throw new Error('Not logged in');
  const next = { ...s.user };
  if (fields.name !== undefined) {
    const n = String(fields.name).trim();
    if (!n) throw new Error('Name cannot be empty.');
    next.name = n;
  }
  if (fields.avatar_url !== undefined) {
    next.avatar_url = fields.avatar_url === '' || fields.avatar_url == null ? null : fields.avatar_url;
  }
  localStorage.setItem('auth_user', JSON.stringify(next));
  return next;
}

/**
 * Change password for local-login accounts.
 *
 * @param {string} token
 * @param {{ currentPassword: string, newPassword: string }} creds
 */
export async function changePassword(token, { currentPassword, newPassword }) {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password:     newPassword,
      }),
    });
    await parseResponse(res);
    return;
  }

  if (!IS_DEV) throw new Error('Authentication service is not configured.');
  if ((newPassword || '').length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }
}

/**
 * Notify the PHP backend to invalidate the current session.
 *
 * @param {string} token  Bearer token.
 */
export async function logoutFromServer(token) {
  if (!token || !API_BASE) return;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // ignore network errors on logout
  }
}

/**
 * Clear the stored session from localStorage.
 */
export function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}

/** Read the current session from localStorage (used on app startup). */
export function getStoredSession() {
  const token = localStorage.getItem('auth_token');
  const userRaw = localStorage.getItem('auth_user');
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
}

/**
 * Mask an email for display in the OTP screen.
 * e.g. "john.doe@example.com" → "j*******e@example.com"
 * @param {string} email
 * @returns {string}
 */
function maskEmailLocal(email) {
  const [local, domain] = (email || '').split('@');
  if (!local || !domain) return email;
  const len    = local.length;
  const masked = len <= 2
    ? local[0] + '*'.repeat(Math.max(1, len - 1))
    : local[0] + '*'.repeat(len - 2) + local[len - 1];
  return masked + '@' + domain;
}
