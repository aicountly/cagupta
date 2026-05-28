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

export async function getPartnerDashboard() {
  const res = await fetch(`${API_BASE}/partner/dashboard`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function getPartnerAssignments(params = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  if (params.status) q.set('status', params.status);
  const res = await fetch(`${API_BASE}/partner/assignments?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return { rows: data.data || [], pagination: data.meta?.pagination || {} };
}

export async function patchPartnerAssignment(id, body) {
  const res = await fetch(`${API_BASE}/partner/assignments/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function getPartnerBankList() {
  const res = await fetch(`${API_BASE}/partner/bank`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function postPartnerBank(body) {
  const res = await fetch(`${API_BASE}/partner/bank`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function getPartnerPayoutRequests() {
  const res = await fetch(`${API_BASE}/partner/payouts`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function postPartnerPayoutRequest(body) {
  const res = await fetch(`${API_BASE}/partner/payouts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function getPartnerAccruals(params = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  const res = await fetch(`${API_BASE}/partner/accruals?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

/** @param {number} [year] */
export async function getPartnerPayoutCycles(year) {
  const y = year ?? new Date().getFullYear();
  const res = await fetch(`${API_BASE}/partner/payout-cycles?year=${encodeURIComponent(y)}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}
