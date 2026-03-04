/**
 * authService.js
 *
 * Centralised authentication helpers.  All functions:
 *  - Call real backend endpoints when VITE_API_BASE_URL is set.
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const IS_DEV = import.meta.env.DEV;

/** Persist token + user profile to localStorage and return the pair. */
function saveSession(token, user) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
  return { token, user };
}

/** Exchange a Google ID-token / credential for an app session. */
export async function loginWithGoogle(googleCredential) {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: googleCredential }),
    });
    if (!res.ok) throw new Error('Google login failed');
    const data = await res.json();
    return saveSession(data.token, data.user);
  }

  // ── Mock mode (dev only) ──────────────────────────────────────────────────
  // NOTE: This path is intentionally insecure — it is a development
  // convenience only.  No JWT signature is verified.
  let mockUser = { name: 'Google User', email: 'user@google.com', initials: 'GU' };
  if (IS_DEV) {
    try {
      const payload = JSON.parse(atob(googleCredential.split('.')[1]));
      const name = payload.name || payload.email || 'Google User';
      mockUser = { name, email: payload.email || mockUser.email, initials: getInitials(name) };
    } catch {
      // ignore decode errors in dev
    }
  }
  return saveSession('mock-google-token', mockUser);
}

/** Exchange a Microsoft MSAL response for an app session. */
export async function loginWithMicrosoft(msalResponse) {
  const idToken = msalResponse.idToken || '';
  const account = msalResponse.account || {};
  const email = account.username || account.upn || '';
  const name = account.name || email || 'Microsoft User';

  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/microsoft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, email, name }),
    });
    if (!res.ok) throw new Error('Microsoft login failed');
    const data = await res.json();
    return saveSession(data.token, data.user);
  }

  // ── Mock mode ────────────────────────────────────────────────────────────
  return saveSession('mock-microsoft-token', { name, email, initials: getInitials(name) });
}

/** Ask the backend (or mock) to send an OTP to the given email. */
export async function requestEmailOtp(email) {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
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
 *     This shortcut is ONLY available when both VITE_API_BASE_URL is unset
 *     AND the build mode is development (import.meta.env.DEV).
 */
export async function verifyEmailOtp(email, otp) {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    if (!res.ok) throw new Error('Invalid or expired OTP');
    const data = await res.json();
    return saveSession(data.token, data.user);
  }

  // ── Mock mode (dev only) ──────────────────────────────────────────────────
  if (!IS_DEV) throw new Error('Authentication service is not configured.');
  if (otp !== '123456') throw new Error('Invalid OTP. (Hint: use 123456 in dev mode)');
  const name = email.split('@')[0];
  return saveSession('mock-email-token', { name, email, initials: getInitials(name) });
}

/**
 * Clear the stored session.
 * Returns the cleared values so callers can update context state immediately.
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
