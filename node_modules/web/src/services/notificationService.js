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

export async function fetchStaffNotifications(limit = 40) {
  const res = await fetch(`${API_BASE_URL}/admin/notifications?limit=${limit}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return {
    rows: json.data || [],
    unread: json.unread ?? 0,
  };
}

export async function markStaffNotificationsRead({ ids = [], all = false } = {}) {
  const res = await fetch(`${API_BASE_URL}/admin/notifications/mark-read`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(all ? { all: true } : { ids }),
  });
  await parseJson(res);
}
