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

export async function getAssociateDashboard() {
  const res = await fetch(`${API_BASE}/associate/dashboard`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function getAssociateServices(params = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  const res = await fetch(`${API_BASE}/associate/services?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return { rows: data.data || [], pagination: data.meta?.pagination || {} };
}

export async function getAssociateCommissions(params = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  if (params.dateFrom) q.set('date_from', params.dateFrom);
  if (params.dateTo) q.set('date_to', params.dateTo);
  const res = await fetch(`${API_BASE}/associate/commissions?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return { rows: data.data || [], meta: data.meta || {} };
}

export async function getAssociateBankList() {
  const res = await fetch(`${API_BASE}/associate/bank`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function postAssociateBank(body) {
  const res = await fetch(`${API_BASE}/associate/bank`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function getAssociatePayoutRequests() {
  const res = await fetch(`${API_BASE}/associate/payout-requests`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function postAssociatePayoutRequest(body) {
  const res = await fetch(`${API_BASE}/associate/payout-requests`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function postSubAssociate(body) {
  const res = await fetch(`${API_BASE}/associate/sub-associates`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function getAssociateRewards() {
  const res = await fetch(`${API_BASE}/associate/rewards`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function postAssociateRedeem(body) {
  const res = await fetch(`${API_BASE}/associate/rewards/redeem`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}
