/**
 * credentialService.js
 *
 * API helpers for the Credentials Vault resource.
 * Calls the PHP backend when VITE_API_BASE_URL is set.
 */

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

/**
 * Map an API credential row to the shape expected by the UI.
 */
function normalizeCredential(c) {
  return {
    id:             c.id,
    clientId:       c.client_id       || null,
    clientName:     c.client_name     || 'Unknown',
    portalName:     c.portal_name     || '',
    portalUrl:      c.url             || c.portal_url || '',
    username:       c.username        || '',
    notes:          c.notes           || '',
    lastChangedAt:  c.updated_at      || c.last_changed_at || c.created_at || '',
    createdAt:      c.created_at      || '',
  };
}

/**
 * Fetch the list of credentials.
 * @returns {Promise<object[]>}
 */
export async function getCredentials({ page = 1, perPage = 100, clientId = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (clientId) params.set('client_id', clientId);

  const res = await fetch(`${API_BASE}/admin/credentials?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeCredential);
}

/**
 * Create a new credential.
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createCredential(payload) {
  const body = {
    client_id:          payload.clientId    || null,
    portal_name:        payload.portalName  || '',
    url:                payload.portalUrl   || null,
    username:           payload.username    || null,
    password_encrypted: payload.password    || null,
    notes:              payload.notes       || null,
  };

  const res = await fetch(`${API_BASE}/admin/credentials`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeCredential(data.data);
}

/**
 * Delete a credential.
 * @param {number|string} id
 */
export async function deleteCredential(id) {
  const res = await fetch(`${API_BASE}/admin/credentials/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

/**
 * Update an existing credential.
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateCredential(id, payload) {
  const body = {
    portal_name:        payload.portalName  || undefined,
    url:                payload.portalUrl   || undefined,
    username:           payload.username    || undefined,
    password_encrypted: payload.password    || undefined,
    notes:              payload.notes       || undefined,
  };

  const res = await fetch(`${API_BASE}/admin/credentials/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeCredential(data.data);
}
