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

export async function fetchInboundEmails({ page = 1, perPage = 30, archived = false } = {}) {
  const q = new URLSearchParams({ page: String(page), per_page: String(perPage), archived: archived ? '1' : '0' });
  const res = await fetch(`${API_BASE_URL}/admin/inbound-emails?${q}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return { rows: json.data || [], pagination: json.pagination || {} };
}

export async function fetchSupportTickets({ page = 1, perPage = 30, status = '' } = {}) {
  const q = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (status) q.set('status', status);
  const res = await fetch(`${API_BASE_URL}/admin/support-tickets?${q}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return { rows: json.data || [], pagination: json.pagination || {} };
}

export async function fetchSupportTicket(id) {
  const res = await fetch(`${API_BASE_URL}/admin/support-tickets/${id}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data;
}

export async function pickTicket(id) {
  const res = await fetch(`${API_BASE_URL}/admin/support-tickets/${id}/pick`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  await parseJson(res);
}

export async function replyTicket(id, { text, html }) {
  const res = await fetch(`${API_BASE_URL}/admin/support-tickets/${id}/reply`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text, html }),
  });
  await parseJson(res);
}

export async function resolveTicket(id, { status = 'resolved', resolution_notes: notes }) {
  const res = await fetch(`${API_BASE_URL}/admin/support-tickets/${id}/resolve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ status, resolution_notes: notes }),
  });
  await parseJson(res);
}

export async function patchInboundEmail(id, body) {
  const res = await fetch(`${API_BASE_URL}/admin/inbound-emails/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseJson(res);
}
