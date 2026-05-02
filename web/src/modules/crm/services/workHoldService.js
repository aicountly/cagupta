/**
 * Accounts work-hold API (contacts / organizations).
 */

import { API_BASE_URL } from '../../../constants/config';

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
    const err = new Error(json.message || `Request failed (${res.status})`);
    err.data = json.data;
    throw err;
  }
  return json;
}

/** @returns {Promise<{ hold: object, exceptions: object[], audit: object[] }>} */
export async function fetchWorkHoldContact(contactId) {
  const res = await fetch(`${API_BASE}/admin/contacts/${contactId}/work-hold`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @returns {Promise<{ hold: object, exceptions: object[], audit: object[] }>} */
export async function fetchWorkHoldOrganization(organizationId) {
  const res = await fetch(`${API_BASE}/admin/organizations/${organizationId}/work-hold`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {{ active: boolean, notes?: string }} body */
export async function updateWorkHoldContact(contactId, body) {
  const res = await fetch(`${API_BASE}/admin/contacts/${contactId}/work-hold`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {{ active: boolean, notes?: string }} body */
export async function updateWorkHoldOrganization(organizationId, body) {
  const res = await fetch(`${API_BASE}/admin/organizations/${organizationId}/work-hold`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await parseResponse(res);
  return json.data;
}

/**
 * @param {object} body
 * @param {'service'|'window'} body.exception_kind
 * @param {number} [body.service_id]
 * @param {string} [body.expires_at] ISO datetime
 */
export async function createWorkHoldExceptionContact(contactId, body) {
  const res = await fetch(`${API_BASE}/admin/contacts/${contactId}/work-hold/exceptions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function createWorkHoldExceptionOrganization(organizationId, body) {
  const res = await fetch(`${API_BASE}/admin/organizations/${organizationId}/work-hold/exceptions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function deleteWorkHoldException(exceptionId) {
  const res = await fetch(`${API_BASE}/admin/work-hold/exceptions/${exceptionId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
