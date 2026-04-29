/**
 * serviceLogService.js
 *
 * API helpers for the service activity log feature.
 *
 * Admin endpoints:
 *   GET    /api/admin/services/pending-followups
 *   GET    /api/admin/services/logs/overdue-count
 *   GET    /api/admin/services/:sid/logs
 *   POST   /api/admin/services/:sid/logs
 *   PATCH  /api/admin/services/:sid/logs/:lid
 *   DELETE /api/admin/services/:sid/logs/:lid
 *   POST   /api/admin/services/:sid/logs/:lid/remind
 *
 * Client portal endpoint:
 *   GET    /api/client/services/:sid/logs
 */

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
    const msg = json.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body   = json;
    throw err;
  }
  return json;
}

// ── Admin: list logs for a service ────────────────────────────────────────────

/**
 * List activity log entries for a service engagement.
 * @param {number|string} serviceId
 * @returns {Promise<Array>}
 */
export async function getServiceLogs(serviceId) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/logs`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? [];
}

// ── Admin: create log entry ───────────────────────────────────────────────────

/**
 * Create a new activity log entry for a service.
 *
 * @param {number|string} serviceId
 * @param {{
 *   log_type: 'note'|'follow_up'|'document_request'|'internal_message'|'reminder',
 *   message: string,
 *   visibility?: 'internal'|'affiliate'|'client',
 *   follow_up_date?: string  // YYYY-MM-DD, required for follow_up type
 * }} payload
 * @returns {Promise<object>}
 */
export async function createServiceLog(serviceId, payload) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/logs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return json.data;
}

// ── Admin: update log entry ───────────────────────────────────────────────────

/**
 * Update a log entry (message, visibility, pin, resolve, follow_up_date).
 *
 * @param {number|string} serviceId
 * @param {number|string} logId
 * @param {{
 *   message?: string,
 *   visibility?: 'internal'|'affiliate'|'client',
 *   follow_up_date?: string|null,
 *   is_pinned?: boolean,
 *   resolve?: boolean
 * }} payload
 * @returns {Promise<object>}
 */
export async function updateServiceLog(serviceId, logId, payload) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/logs/${logId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return json.data;
}

// ── Admin: delete log entry ───────────────────────────────────────────────────

/**
 * Permanently delete a log entry. Super admin only.
 * @param {number|string} serviceId
 * @param {number|string} logId
 * @returns {Promise<void>}
 */
export async function deleteServiceLog(serviceId, logId) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/logs/${logId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

// ── Admin: send reminder ──────────────────────────────────────────────────────

/**
 * Send a reminder email to the client/affiliate for a follow-up log entry.
 * @param {number|string} serviceId
 * @param {number|string} logId
 * @returns {Promise<object>}  Updated log entry
 */
export async function sendLogReminder(serviceId, logId) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/logs/${logId}/remind`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

// ── Admin: pending follow-ups (cross-service) ─────────────────────────────────

/**
 * Fetch all unresolved follow-up entries across all services, due within daysAhead days.
 * @param {{ daysAhead?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function getPendingFollowUps({ daysAhead = 30 } = {}) {
  const params = new URLSearchParams({ days_ahead: String(daysAhead) });
  const res = await fetch(`${API_BASE}/admin/services/pending-followups?${params}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? [];
}

// ── Admin: overdue count (sidebar badge) ─────────────────────────────────────

/**
 * Return the count of overdue unresolved follow-ups.
 * @returns {Promise<number>}
 */
export async function getOverdueFollowUpCount() {
  const res = await fetch(`${API_BASE}/admin/services/logs/overdue-count`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return (json.data?.count) ?? 0;
}

// ── Client portal: list client-visible logs ───────────────────────────────────

/**
 * List client-visible log entries for a service (client portal only).
 * @param {number|string} serviceId
 * @returns {Promise<Array>}
 */
export async function getClientServiceLogs(serviceId) {
  const res = await fetch(`${API_BASE}/client/services/${serviceId}/logs`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? [];
}
