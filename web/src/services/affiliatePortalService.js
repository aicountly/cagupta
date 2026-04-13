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

export async function getAffiliateDashboard() {
  const res = await fetch(`${API_BASE}/affiliate/dashboard`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function getAffiliateServices(params = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  const res = await fetch(`${API_BASE}/affiliate/services?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return { rows: data.data || [], pagination: data.meta?.pagination || {} };
}

export async function getAffiliateCommissions(params = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', params.page);
  if (params.perPage) q.set('per_page', params.perPage);
  if (params.dateFrom) q.set('date_from', params.dateFrom);
  if (params.dateTo) q.set('date_to', params.dateTo);
  const res = await fetch(`${API_BASE}/affiliate/commissions?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return { rows: data.data || [], meta: data.meta || {} };
}

export async function getAffiliateBankList() {
  const res = await fetch(`${API_BASE}/affiliate/bank`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function postAffiliateBank(body) {
  const res = await fetch(`${API_BASE}/affiliate/bank`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}

export async function getAffiliatePayoutRequests() {
  const res = await fetch(`${API_BASE}/affiliate/payout-requests`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function postAffiliatePayoutRequest(body) {
  const res = await fetch(`${API_BASE}/affiliate/payout-requests`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

export async function postSubAffiliate(body) {
  const res = await fetch(`${API_BASE}/affiliate/sub-affiliates`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}
