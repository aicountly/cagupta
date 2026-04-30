import { API_BASE_URL } from '../constants/config';

const API_BASE = API_BASE_URL;

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

// ── Connected accounts ────────────────────────────────────────────────────────

/**
 * Returns an array of connected provider groups, each with their calendar list.
 * [{provider, provider_email, connected, calendars: [{id, calendar_id, calendar_name, ...}]}]
 */
export async function getCalendarAccounts() {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/accounts`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}

// ── OAuth authorize URLs ──────────────────────────────────────────────────────

/** @returns {Promise<{authorizationUrl: string, state: string}>} */
export async function getGoogleAuthorizeUrl() {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/google/authorize`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/** @returns {Promise<{authorizationUrl: string, state: string}>} */
export async function getOutlookAuthorizeUrl() {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/outlook/authorize`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/**
 * Connect Apple iCloud Calendar via CalDAV credentials.
 * @param {{apple_id: string, app_password: string}} credentials
 */
export async function connectApple(credentials) {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/apple/connect`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(credentials),
  });
  return parseResponse(res);
}

// ── Account management ────────────────────────────────────────────────────────

/**
 * Disconnect a provider account (deletes token + all its calendars).
 * @param {number} tokenId  — calendar_oauth_tokens.id
 */
export async function disconnectAccount(tokenId) {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/accounts/${tokenId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return parseResponse(res);
}

/**
 * Update a single calendar's sync settings.
 * @param {number} accountId  — calendar_sync_accounts.id
 * @param {{sync_enabled?: boolean, sync_direction?: string}} patch
 */
export async function updateCalendarAccount(accountId, patch) {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/accounts/${accountId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return parseResponse(res);
}

// ── Global settings ───────────────────────────────────────────────────────────

export async function getSyncSettings() {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/settings`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/**
 * @param {{default_provider?: string, conflict_resolution?: string, auto_sync_enabled?: boolean}} settings
 */
export async function updateSyncSettings(settings) {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/settings`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

// ── Manual sync ───────────────────────────────────────────────────────────────

/**
 * Trigger a pull sync for the current user's enabled calendars.
 * @returns {Promise<{imported: number, conflicts: number, errors: string[]}>}
 */
export async function triggerSync() {
  const res = await fetch(`${API_BASE}/admin/integrations/calendar/sync`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

// ── OAuth popup helper ────────────────────────────────────────────────────────

/**
 * Open an OAuth popup window, wait for the postMessage callback, then resolve.
 * @param {string} url        — the provider authorisation URL
 * @param {string} messageType — e.g. 'google_calendar_oauth' | 'outlook_calendar_oauth'
 * @returns {Promise<void>}
 */
export function openOAuthPopup(url, messageType) {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, '_blank', 'width=600,height=700,scrollbars=yes');
    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    function onMessage(evt) {
      if (evt.data?.type === messageType) {
        window.removeEventListener('message', onMessage);
        if (evt.data.ok) {
          resolve();
        } else {
          reject(new Error('OAuth authorisation failed.'));
        }
      }
    }
    window.addEventListener('message', onMessage);

    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', onMessage);
        reject(new Error('Popup closed before completing authorisation.'));
      }
    }, 500);
  });
}
