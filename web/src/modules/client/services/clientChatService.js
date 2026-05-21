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

export async function fetchClientChatThread({ afterId = 0 } = {}) {
  const q = afterId > 0 ? `?after_id=${afterId}` : '';
  const res = await fetch(`${API_BASE_URL}/client/chat/thread${q}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return {
    conversation: json.data?.conversation || null,
    messages: json.data?.messages || [],
    hasMore: Boolean(json.has_more),
  };
}

export async function sendClientChatMessage(bodyText) {
  const res = await fetch(`${API_BASE_URL}/client/chat/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ body_text: bodyText }),
  });
  const json = await parseJson(res);
  return json.data;
}

export async function markClientChatRead(messageId) {
  const res = await fetch(`${API_BASE_URL}/client/chat/read`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ message_id: messageId }),
  });
  await parseJson(res);
}
