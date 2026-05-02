import { API_BASE_URL } from '../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson(res) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || `Request failed (${res.status})`);
  return j;
}

/** @param {string} billingFirmCode */
export async function listFirmBankAccounts(billingFirmCode) {
  const q = new URLSearchParams();
  if (billingFirmCode) q.set('billing_firm_code', billingFirmCode);
  const res = await fetch(`${API_BASE_URL}/admin/firm-bank-accounts?${q}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data ?? json ?? [];
}

export async function createFirmBankAccount(body) {
  const res = await fetch(`${API_BASE_URL}/admin/firm-bank-accounts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  return json.data ?? json;
}

export async function updateFirmBankAccount(id, body) {
  const res = await fetch(`${API_BASE_URL}/admin/firm-bank-accounts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  return json.data ?? json;
}

export async function deleteFirmBankAccount(id) {
  const res = await fetch(`${API_BASE_URL}/admin/firm-bank-accounts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseJson(res);
}
