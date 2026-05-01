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
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

export async function getPartners(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  const res = await fetch(`${API_BASE}/admin/partners?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function createPartner(body) {
  const res = await fetch(`${API_BASE}/admin/partners/create`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function approvePartner(userId) {
  const res = await fetch(`${API_BASE}/admin/partners/${userId}/approve`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

export async function suspendPartner(userId) {
  const res = await fetch(`${API_BASE}/admin/partners/${userId}/suspend`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

export async function assignWorkToPartner(body) {
  const res = await fetch(`${API_BASE}/admin/partner-assignments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function getPartnerAssignments(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  const res = await fetch(`${API_BASE}/admin/partner-assignments?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function getPartnerPayoutRequests(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  const res = await fetch(`${API_BASE}/admin/partner-payout-requests?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function updatePartnerPayoutRequest(id, body) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-requests/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function verifyPartnerBank(id, body) {
  const res = await fetch(`${API_BASE}/admin/partner-bank/${id}/verify`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}
