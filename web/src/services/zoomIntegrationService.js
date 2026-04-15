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
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

export async function getZoomIntegrationStatus() {
  const res = await fetch(`${API_BASE}/admin/integrations/zoom/status`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

/** @returns {Promise<{ authorizationUrl: string, state: string }>} */
export async function getZoomAuthorizeUrl() {
  const res = await fetch(`${API_BASE}/admin/integrations/zoom/authorize`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}
