/**
 * portalTypeService.js
 *
 * API helpers for the Portal Types resource.
 * Falls back gracefully when VITE_API_BASE_URL is not set.
 */

import { API_BASE_URL } from '../constants/config';
import { getPortalTypes, savePortalTypes } from '../constants/portalTypes';

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
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

function normalise(row) {
  return {
    id:   row.id,
    name: row.name || '',
    url:  row.url || '',
  };
}

/**
 * Fetch portal types — from API when available, localStorage otherwise.
 */
export async function fetchPortalTypes() {
  if (!API_BASE) return getPortalTypes();
  try {
    const res  = await fetch(`${API_BASE}/admin/portal-types`, { headers: authHeaders() });
    const data = await parseResponse(res);
    const list = (data.data || data || []).map(normalise);
    savePortalTypes(list); // keep localStorage in sync
    return list;
  } catch {
    return getPortalTypes(); // fallback to localStorage
  }
}

/**
 * Create a new portal type.
 */
export async function createPortalType(payload) {
  if (!API_BASE) {
    // localStorage-only mode
    const list    = getPortalTypes();
    const newItem = { id: `local-${Date.now()}`, name: payload.name, url: payload.url || '' };
    const updated = [...list, newItem];
    savePortalTypes(updated);
    return newItem;
  }
  const res  = await fetch(`${API_BASE}/admin/portal-types`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ name: payload.name, url: payload.url || null }),
  });
  const data = await parseResponse(res);
  const item = normalise(data.data || data);
  // sync localStorage
  const list = getPortalTypes();
  savePortalTypes([...list, item]);
  return item;
}

/**
 * Update an existing portal type.
 */
export async function updatePortalType(id, payload) {
  if (!API_BASE) {
    const list    = getPortalTypes();
    const updated = list.map(p =>
      String(p.id) === String(id) ? { ...p, name: payload.name, url: payload.url || '' } : p
    );
    savePortalTypes(updated);
    return updated.find(p => String(p.id) === String(id));
  }
  const res  = await fetch(`${API_BASE}/admin/portal-types/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify({ name: payload.name, url: payload.url || null }),
  });
  const data = await parseResponse(res);
  const item = normalise(data.data || data);
  // sync localStorage
  const list    = getPortalTypes();
  const updated = list.map(p => (String(p.id) === String(id) ? item : p));
  savePortalTypes(updated);
  return item;
}

/**
 * Delete a portal type by id.
 */
export async function deletePortalType(id) {
  if (!API_BASE) {
    const updated = getPortalTypes().filter(p => p.id !== id);
    savePortalTypes(updated);
    return;
  }
  const res = await fetch(`${API_BASE}/admin/portal-types/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
  // sync localStorage
  const updated = getPortalTypes().filter(p => String(p.id) !== String(id));
  savePortalTypes(updated);
}
