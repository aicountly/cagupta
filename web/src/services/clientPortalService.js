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

export async function getClientMe() {
  const res = await fetch(`${API_BASE}/client/me`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function getClientServices({ group = 'active', page = 1, perPage = 50, search = '' } = {}) {
  const q = new URLSearchParams();
  q.set('group', group);
  q.set('page', String(page));
  q.set('per_page', String(perPage));
  if (search) q.set('search', search);
  const res = await fetch(`${API_BASE}/client/services?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return { rows: data.data || [], pagination: data.meta?.pagination || {} };
}

export async function getClientService(id) {
  const res = await fetch(`${API_BASE}/client/services/${id}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || null;
}

export async function getClientLedger({ organizationId } = {}) {
  const q = new URLSearchParams();
  if (organizationId) q.set('organization_id', String(organizationId));
  const res = await fetch(`${API_BASE}/client/ledger?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}
