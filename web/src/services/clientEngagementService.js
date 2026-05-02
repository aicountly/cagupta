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

export async function fetchMemorandumEngagementTypeIds() {
  const res = await fetch(`${API_BASE_URL}/admin/settings/memorandum-revenue-types`, { headers: authHeaders() });
  const json = await parseJson(res);
  return json.data?.engagement_type_ids || [];
}

export async function saveMemorandumEngagementTypeIds(ids) {
  const res = await fetch(`${API_BASE_URL}/admin/settings/memorandum-revenue-types`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ engagement_type_ids: ids }),
  });
  const json = await parseJson(res);
  return json.data?.engagement_type_ids || [];
}

export async function fetchClientEngagementGaps(params = {}) {
  const q = new URLSearchParams();
  if (params.minBilling != null) q.set('min_billing', String(params.minBilling));
  if (params.minGapDays != null) q.set('min_gap_days', String(params.minGapDays));
  if (params.groupId) q.set('group_id', String(params.groupId));
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const res = await fetch(`${API_BASE_URL}/admin/reports/client-engagement-gaps?${q}`, { headers: authHeaders() });
  const json = await parseJson(res);
  return { rows: json.data || [], period: json.period || {} };
}
