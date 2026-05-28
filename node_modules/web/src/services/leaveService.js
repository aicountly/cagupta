/**
 * leaveService.js
 *
 * API helpers for the staff leave and temporary service handover feature.
 * Maps to:
 *   GET    /api/admin/leaves
 *   POST   /api/admin/leaves
 *   GET    /api/admin/leaves/my-charges
 *   GET    /api/admin/leaves/:id
 *   PATCH  /api/admin/leaves/:id
 *   POST   /api/admin/leaves/:id/handover
 *   DELETE /api/admin/leaves/:id/assignments/:aid
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

// ── Leave records ─────────────────────────────────────────────────────────────

/**
 * List all leave records.
 * @param {{ status?: string, userId?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function getLeaves({ status = '', userId = 0 } = {}) {
  const params = new URLSearchParams();
  if (status)  params.set('status', status);
  if (userId)  params.set('user_id', String(userId));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${API_BASE}/admin/leaves${qs}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? [];
}

/**
 * Fetch a single leave with its assignments.
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function getLeave(id) {
  const res = await fetch(`${API_BASE}/admin/leaves/${id}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/**
 * Create a new leave record.
 * @param {{ user_id: number, start_date: string, end_date: string, reason?: string }} payload
 * @returns {Promise<object>}
 */
export async function createLeave(payload) {
  const res = await fetch(`${API_BASE}/admin/leaves`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return json.data;
}

/**
 * Update leave dates / reason / status.
 * Pass status: 'cancelled' to cancel and bulk-revoke all handovers.
 * @param {number} id
 * @param {{ start_date?: string, end_date?: string, reason?: string, status?: string }} payload
 * @returns {Promise<object>}
 */
export async function updateLeave(id, payload) {
  const res = await fetch(`${API_BASE}/admin/leaves/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return json.data;
}

// ── Handover assignments ──────────────────────────────────────────────────────

/**
 * Assign services to temporary users for this leave period.
 * Supports partial allotment: different services can go to different users.
 *
 * @param {number} leaveId
 * @param {Array<{ service_id: number, temp_user_id: number }>} assignments
 * @returns {Promise<{ assignments: Array, errors: string[] }>}
 */
export async function createHandover(leaveId, assignments) {
  const res = await fetch(`${API_BASE}/admin/leaves/${leaveId}/handover`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ assignments }),
  });
  const json = await parseResponse(res);
  return json.data;
}

/**
 * Revoke a single assignment (take back handover for one service).
 * @param {number} leaveId
 * @param {number} assignmentId
 * @returns {Promise<object>}
 */
export async function revokeAssignment(leaveId, assignmentId) {
  const res = await fetch(
    `${API_BASE}/admin/leaves/${leaveId}/assignments/${assignmentId}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  const json = await parseResponse(res);
  return json.data;
}

// ── Current user's temporary charges ─────────────────────────────────────────

/**
 * Return services the authenticated user currently holds as temporary charge.
 * Filtered server-side to today's active, non-revoked assignments.
 *
 * @returns {Promise<Array>}
 */
export async function getMyTemporaryCharges() {
  const res = await fetch(`${API_BASE}/admin/leaves/my-charges`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? [];
}
