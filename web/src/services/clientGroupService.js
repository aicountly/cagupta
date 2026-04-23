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

export async function getGroups() {
  const res = await fetch(`${API_BASE}/admin/client-groups`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

/** Debounced type-ahead: GET /admin/client-groups/search?q=&limit= */
export async function searchClientGroups(q, limit = 20) {
  const trimmed = (q || '').trim();
  if (!trimmed) return [];
  const params = new URLSearchParams({ q: trimmed, limit: String(Math.min(50, Math.max(1, limit))) });
  const res = await fetch(`${API_BASE}/admin/client-groups/search?${params}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function createGroup(payload) {
  const res = await fetch(`${API_BASE}/admin/client-groups`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function updateGroup(id, payload) {
  const res = await fetch(`${API_BASE}/admin/client-groups/${id}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function deleteGroup(id) {
  const res = await fetch(`${API_BASE}/admin/client-groups/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  await parseResponse(res);
}

export async function getGroupMembers(id) {
  const res = await fetch(`${API_BASE}/admin/client-groups/${id}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  const members = data.data?.members || { contacts: [], organizations: [] };
  // #region agent log
  const c0 = members.contacts?.[0];
  const o0 = members.organizations?.[0];
  fetch('http://127.0.0.1:7680/ingest/98bef636-b446-415e-8bd6-5036c92e86f1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '984c9c' }, body: JSON.stringify({ sessionId: '984c9c', runId: 'post-fix', hypothesisId: 'H1', location: 'clientGroupService.js:getGroupMembers', message: 'API member row keys and name fields', data: { groupId: id, nContacts: members.contacts?.length ?? 0, nOrgs: members.organizations?.length ?? 0, contactKeys: c0 ? Object.keys(c0) : null, orgKeys: o0 ? Object.keys(o0) : null, contactNameFields: c0 ? { display_name: c0.display_name, displayName: c0.displayName, first_name: c0.first_name, last_name: c0.last_name, organization_name: c0.organization_name } : null, orgNameFields: o0 ? { display_name: o0.display_name, displayName: o0.displayName, name: o0.name } : null }, timestamp: Date.now() }) }).catch(() => {});
  // #endregion
  return members;
}
