/**
 * ledgerRecoveryStatusService.js
 *
 * API helpers for NPA / bad-debt classification on ledger entities.
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
    err.apiData = json.data;
    throw err;
  }
  return json;
}

/**
 * Fetch recovery classification status for an entity.
 *
 * @param {{ entityType: 'client'|'organization', entityId: number }} opts
 * @returns {Promise<Object|null>}
 */
export async function getRecoveryStatus({ entityType, entityId }) {
  const params = new URLSearchParams({ entity_type: entityType, entity_id: String(entityId) });
  const res = await fetch(`${API_BASE}/admin/ledger-recovery-status?${params}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data ?? null;
}

/**
 * Mark an entity as NPA (requires positive receivable balance).
 *
 * @param {{ entity_type: string, entity_id: number, reason: string }} payload
 * @returns {Promise<Object>}
 */
export async function markNpa(payload) {
  const res = await fetch(`${API_BASE}/admin/ledger-recovery-status/mark-npa`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

/**
 * Mark an NPA entity as bad debt (one-way, terminal).
 *
 * @param {{ entity_type: string, entity_id: number, reason: string }} payload
 * @returns {Promise<Object>}
 */
export async function markBadDebt(payload) {
  const res = await fetch(`${API_BASE}/admin/ledger-recovery-status/mark-bad-debt`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}
