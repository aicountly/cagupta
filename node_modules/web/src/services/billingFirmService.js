import { API_BASE_URL } from '../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

/** @returns {Promise<Array<{ id: string, code: string, name: string, gstRegistered: boolean, gstin: string, stateCode: string, defaultGstRate: number }>>} */
export async function listBillingFirms() {
  const res = await fetch(`${API_BASE_URL}/admin/billing-firms`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data ?? json ?? [];
}

export async function createBillingFirm(body) {
  const res = await fetch(`${API_BASE_URL}/admin/billing-firms`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  return json.data ?? json;
}

export async function updateBillingFirm(code, body) {
  const enc = encodeURIComponent(code);
  const res = await fetch(`${API_BASE_URL}/admin/billing-firms/${enc}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  return json.data ?? json;
}

export async function deleteBillingFirm(code) {
  const enc = encodeURIComponent(code);
  const res = await fetch(`${API_BASE_URL}/admin/billing-firms/${enc}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseJson(res);
}
