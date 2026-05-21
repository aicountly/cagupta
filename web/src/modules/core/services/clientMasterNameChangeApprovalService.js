/**
 * clientMasterNameChangeApprovalService.js
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

export async function listPendingClientMasterNameChanges() {
  const res = await fetch(`${API_BASE}/admin/approvals/client-master-name-changes`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function approveClientMasterNameChange(id, body = {}) {
  const res = await fetch(`${API_BASE}/admin/approvals/client-master-name-changes/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function rejectClientMasterNameChange(id, reason) {
  const res = await fetch(`${API_BASE}/admin/approvals/client-master-name-changes/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  return parseResponse(res);
}

export function entityTypeLabel(entityType) {
  const m = {
    contact: 'Contact',
    organization: 'Organization',
    client_group: 'Client group',
  };
  return m[entityType] || entityType;
}

export function entityEditPath(entityType, entityId) {
  if (entityType === 'contact') return `/clients/contacts/${entityId}/edit`;
  if (entityType === 'organization') return `/clients/organizations/${entityId}/edit`;
  return '/clients/groups';
}
