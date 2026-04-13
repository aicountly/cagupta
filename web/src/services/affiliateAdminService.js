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

/** Approved affiliate profiles for service linking dropdowns. */
export async function getApprovedAffiliates() {
  const res = await fetch(`${API_BASE}/admin/affiliates?status=approved&per_page=200`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map((row) => ({
    id: row.user_id,
    name: row.name,
    email: row.email,
    status: row.status,
  }));
}

export async function getAffiliatesAdmin({ status = 'all', page = 1, perPage = 50 } = {}) {
  const q = new URLSearchParams({ status, page, per_page: perPage });
  const res = await fetch(`${API_BASE}/admin/affiliates?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function approveAffiliate(userId) {
  const res = await fetch(`${API_BASE}/admin/affiliates/${userId}/approve`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  await parseResponse(res);
}

export async function suspendAffiliate(userId) {
  const res = await fetch(`${API_BASE}/admin/affiliates/${userId}/suspend`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  await parseResponse(res);
}

export async function getCommissionDefaults() {
  const res = await fetch(`${API_BASE}/admin/commission-defaults`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function putCommissionDefaults(body) {
  const res = await fetch(`${API_BASE}/admin/commission-defaults`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function getAffiliateRates(userId) {
  const res = await fetch(`${API_BASE}/admin/affiliates/${userId}/rates`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function postAffiliateRate(userId, body) {
  const res = await fetch(`${API_BASE}/admin/affiliates/${userId}/rates`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function deleteAffiliateRate(rateId) {
  const res = await fetch(`${API_BASE}/admin/affiliate-rates/${rateId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

export async function getPayoutRequestsAdmin({ status = '', page = 1, perPage = 50 } = {}) {
  const q = new URLSearchParams({ page, per_page: perPage });
  if (status) q.set('status', status);
  const res = await fetch(`${API_BASE}/admin/payout-requests?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function patchPayoutRequest(id, body) {
  const res = await fetch(`${API_BASE}/admin/payout-requests/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function patchAffiliateBankVerify(id, body) {
  const res = await fetch(`${API_BASE}/admin/affiliate-bank/${id}/verify`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}
