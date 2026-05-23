/**
 * clientMasterEditApprovalService.js
 */

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
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

export async function listPendingClientMasterEdits() {
  const res = await fetch(`${API_BASE}/admin/approvals/client-master-edits`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function approveClientMasterEdit(id, body = {}) {
  const res = await fetch(`${API_BASE}/admin/approvals/client-master-edits/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function rejectClientMasterEdit(id, reason) {
  const res = await fetch(`${API_BASE}/admin/approvals/client-master-edits/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  return parseResponse(res);
}

export { entityTypeLabel, entityEditPath } from './clientMasterNameChangeApprovalService';
