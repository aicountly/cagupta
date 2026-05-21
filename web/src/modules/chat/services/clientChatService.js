import { API_BASE_URL } from '../../../constants/config';

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

export async function fetchClientChatThreads({ filter = '', page = 1, perPage = 50 } = {}) {
  const q = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (filter) q.set('filter', filter);
  const res = await fetch(`${API_BASE_URL}/admin/client-chat/threads?${q}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return { rows: json.data || [], pagination: json.pagination || {} };
}

export async function fetchClientChatThread(id) {
  const res = await fetch(`${API_BASE_URL}/admin/client-chat/threads/${id}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data;
}

export async function fetchClientChatMessages(threadId, { afterId = 0, limit = 50 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (afterId > 0) q.set('after_id', String(afterId));
  const res = await fetch(`${API_BASE_URL}/admin/client-chat/threads/${threadId}/messages?${q}`, {
    headers: authHeaders(),
  });
  const json = await parseJson(res);
  return { rows: json.data || [], hasMore: Boolean(json.has_more) };
}

export async function sendStaffClientChatMessage(threadId, bodyText) {
  const res = await fetch(`${API_BASE_URL}/admin/client-chat/threads/${threadId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ body_text: bodyText }),
  });
  const json = await parseJson(res);
  return json.data;
}

export async function markStaffClientChatRead(threadId, messageId) {
  const res = await fetch(`${API_BASE_URL}/admin/client-chat/threads/${threadId}/read`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ message_id: messageId }),
  });
  await parseJson(res);
}
