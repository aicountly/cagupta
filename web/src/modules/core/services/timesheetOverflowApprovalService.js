import { API_BASE_URL } from '../../../constants/config';

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

/** @returns {Promise<object[]>} */
export async function listPendingTimesheetOverflowRequests() {
  const res = await fetch(`${API_BASE}/admin/approvals/timesheet-overflow`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || [];
}

/** @param {{ approved_duration_minutes?: number, decision_notes?: string }} body */
export async function approveTimesheetOverflowRequest(requestId, body = {}) {
  const res = await fetch(`${API_BASE}/admin/approvals/timesheet-overflow/${requestId}/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function rejectTimesheetOverflowRequest(requestId, reason) {
  const res = await fetch(`${API_BASE}/admin/approvals/timesheet-overflow/${requestId}/reject`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  return parseResponse(res);
}
