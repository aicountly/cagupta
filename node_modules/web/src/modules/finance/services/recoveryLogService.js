/**
 * recoveryLogService.js
 *
 * API helpers for recovery logs — per-entity follow-up tracking for receivables.
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
 * Fetch all recovery logs for an entity, newest first.
 *
 * @param {{ entityType: 'client'|'organization', entityId: number }} opts
 * @returns {Promise<Array>}
 */
export async function getRecoveryLogs({ entityType, entityId }) {
  const params = new URLSearchParams({ entity_type: entityType, entity_id: String(entityId) });
  const res = await fetch(`${API_BASE}/admin/recovery-logs?${params}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

/**
 * Create a new recovery log entry.
 *
 * @param {{
 *   entity_type: string,
 *   entity_id: number,
 *   log_date?: string,
 *   followup_details?: string,
 *   client_response?: string,
 *   next_followup_date?: string,
 *   next_followup_details?: string,
 *   revised_due_date?: string,
 * }} payload
 * @returns {Promise<Object>}
 */
export async function createRecoveryLog(payload) {
  const res = await fetch(`${API_BASE}/admin/recovery-logs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

/**
 * Update an existing recovery log entry.
 *
 * @param {number} id
 * @param {Partial<{
 *   log_date: string,
 *   followup_details: string,
 *   client_response: string,
 *   next_followup_date: string,
 *   next_followup_details: string,
 *   revised_due_date: string,
 * }>} payload
 * @returns {Promise<Object>}
 */
export async function updateRecoveryLog(id, payload) {
  const res = await fetch(`${API_BASE}/admin/recovery-logs/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}
