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
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

export async function getGroups() {
  const res = await fetch(`${API_BASE}/admin/client-groups`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

/** Debounced type-ahead: GET /admin/client-groups/search?q=&limit= */
export async function searchClientGroups(q, limit = 20) {
  const trimmed = (q || '').trim();
  if (!trimmed) return [];
  const params = new URLSearchParams({ q: trimmed, limit: String(Math.min(50, Math.max(1, limit))) });
  const res = await fetch(`${API_BASE}/admin/client-groups/search?${params}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function createGroup(payload) {
  const res = await fetch(`${API_BASE}/admin/client-groups`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function updateGroup(id, payload) {
  const res = await fetch(`${API_BASE}/admin/client-groups/${id}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function deleteGroup(id) {
  const res = await fetch(`${API_BASE}/admin/client-groups/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  await parseResponse(res);
}

export async function getGroupMembers(id) {
  const res = await fetch(`${API_BASE}/admin/client-groups/${id}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data?.members || { contacts: [], organizations: [] };
}
