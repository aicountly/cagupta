import { API_BASE_URL } from '../../../constants/config';

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

export async function fetchConversations() {
  const res = await fetch(`${API_BASE_URL}/chat/conversations`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data || [];
}

export async function fetchConversation(id) {
  const res = await fetch(`${API_BASE_URL}/chat/conversations/${id}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data;
}

export async function createConversation(payload) {
  const res = await fetch(`${API_BASE_URL}/chat/conversations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseJson(res);
  return json.data;
}

export async function fetchMessages(conversationId, { afterId = 0, beforeId = 0, limit = 50 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (afterId > 0) q.set('after_id', String(afterId));
  if (beforeId > 0) q.set('before_id', String(beforeId));
  const res = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages?${q}`, {
    headers: authHeaders(),
  });
  const json = await parseJson(res);
  return { rows: json.data || [], hasMore: Boolean(json.has_more) };
}

export async function sendMessage(conversationId, bodyText) {
  const res = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ body_text: bodyText }),
  });
  const json = await parseJson(res);
  return json.data;
}

export async function markConversationRead(conversationId, messageId) {
  const res = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ message_id: messageId }),
  });
  await parseJson(res);
}

export async function fetchChatContacts() {
  const res = await fetch(`${API_BASE_URL}/chat/contacts`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data || [];
}

export async function fetchChatUnreadCount() {
  const res = await fetch(`${API_BASE_URL}/chat/unread-count`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data?.unread_count ?? 0;
}

export async function addChannelMembers(conversationId, userIds) {
  const res = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/members`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ user_ids: userIds }),
  });
  const json = await parseJson(res);
  return json.data;
}

export async function leaveChannel(conversationId) {
  const res = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/leave`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  await parseJson(res);
}

export async function searchChatAudit({
  q = '', senderUserId = 0, conversationId = 0, dateFrom = '', dateTo = '',
  conversationType = '', senderKind = '', page = 1, perPage = 50,
} = {}) {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (q) params.set('q', q);
  if (senderUserId > 0) params.set('sender_user_id', String(senderUserId));
  if (conversationId > 0) params.set('conversation_id', String(conversationId));
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  if (conversationType) params.set('conversation_type', conversationType);
  if (senderKind) params.set('sender_kind', senderKind);
  const res = await fetch(`${API_BASE_URL}/admin/chat/audit?${params}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return { rows: json.data || [], pagination: json.pagination || {} };
}

export async function fetchAuditConversationThread(conversationId, { limit = 100 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${API_BASE_URL}/admin/chat/audit/conversations/${conversationId}?${q}`, {
    headers: authHeaders(),
  });
  const json = await parseJson(res);
  return json.data;
}
