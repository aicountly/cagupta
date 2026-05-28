/**
 * masterAuditService.js — fetch admin audit logs for client masters.
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
  if (!res.ok) {
    const err = new Error(json.message || `Request failed (${res.status})`);
    if (json.meta) err.meta = json.meta;
    throw err;
  }
  return json;
}

/**
 * @param {'contact'|'organization'|'client_group'} entityType
 * @param {number|string} entityId
 * @param {{ limit?: number, offset?: number }} [opts]
 */
export async function fetchMasterAuditLog(entityType, entityId, { limit = 50, offset = 0 } = {}) {
  const pathMap = {
    contact: 'contacts',
    organization: 'organizations',
    client_group: 'client-groups',
  };
  const segment = pathMap[entityType];
  if (!segment) return [];

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(
    `${API_BASE}/admin/${segment}/${entityId}/audit-log?${params}`,
    { headers: authHeaders() },
  );
  const data = await parseResponse(res);
  return data.data || [];
}

export async function fetchContactAuditLog(id, opts) {
  return fetchMasterAuditLog('contact', id, opts);
}

export async function fetchOrganizationAuditLog(id, opts) {
  return fetchMasterAuditLog('organization', id, opts);
}

export async function fetchClientGroupAuditLog(id, opts) {
  return fetchMasterAuditLog('client_group', id, opts);
}

/** Human-readable labels for audit actions. */
export function formatMasterAuditAction(action) {
  const m = {
    'contact.created': 'Created',
    'contact.updated': 'Updated',
    'contact.status_changed': 'Status changed',
    'contact.deleted': 'Deleted',
    'contact.name_change_approved': 'Name change approved',
    'contact.name_change_rejected': 'Name change rejected',
    'organization.created': 'Created',
    'organization.updated': 'Updated',
    'organization.status_changed': 'Status changed',
    'organization.deleted': 'Deleted',
    'organization.name_change_approved': 'Name change approved',
    'organization.name_change_rejected': 'Name change rejected',
    'client_group.created': 'Created',
    'client_group.updated': 'Updated',
    'client_group.deleted': 'Deleted',
    'client_group.name_change_approved': 'Name change approved',
    'client_group.name_change_rejected': 'Name change rejected',
  };
  if (m[action]) return m[action];
  return String(action || '').replace(/\./g, ' · ').replace(/_/g, ' ');
}

/** Summarize field diffs from before/after snapshots. */
export function summarizeSnapshotDiff(before, after) {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const lines = [];
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    const bs = b == null || b === '' ? '—' : String(b);
    const as = a == null || a === '' ? '—' : String(a);
    if (bs !== as) {
      lines.push(`${k.replace(/_/g, ' ')}: ${bs} → ${as}`);
    }
  }
  return lines;
}
