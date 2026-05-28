/**
 * registerService.js
 *
 * API helpers for the compliance Registers resource.
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
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── GET /api/admin/registers ──────────────────────────────────────────────────

/**
 * Fetch a paginated list of register entries.
 *
 * @param {Object} params
 * @param {string}  [params.register_category]   gst | tds | it | roc | pf | payment
 * @param {string}  [params.status]              pending | filed | overdue
 * @param {number}  [params.client_id]
 * @param {number}  [params.organization_id]
 * @param {number}  [params.engagement_type_id]
 * @param {string}  [params.period_label]        partial match
 * @param {string}  [params.date_from]           YYYY-MM-DD
 * @param {string}  [params.date_to]             YYYY-MM-DD
 * @param {string}  [params.search]              free-text
 * @param {number}  [params.page]
 * @param {number}  [params.per_page]
 *
 * @returns {Promise<{rows: Array, pagination: Object}>}
 */
export async function getRegisters(params = {}) {
  const res  = await fetch(`${API_BASE}/api/admin/registers${buildQuery(params)}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return {
    rows:       json.data  ?? [],
    pagination: json.pagination ?? { page: 1, per_page: 50, total: 0, last_page: 1 },
  };
}

// ── GET /api/admin/registers/counts ──────────────────────────────────────────

/**
 * Returns status counts per register_category.
 * @returns {Promise<Object>}  e.g. { gst: { pending: 3, overdue: 1, filed: 10, total: 14 }, … }
 */
export async function getRegisterCounts() {
  const res  = await fetch(`${API_BASE}/api/admin/registers/counts`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? {};
}

// ── GET /api/admin/registers/:id ─────────────────────────────────────────────

export async function getRegister(id) {
  const res  = await fetch(`${API_BASE}/api/admin/registers/${id}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? null;
}

// ── POST /api/admin/registers ─────────────────────────────────────────────────

/**
 * Create a register entry manually.
 * @param {Object} data
 * @returns {Promise<Object>} created row
 */
export async function createRegister(data) {
  const res  = await fetch(`${API_BASE}/api/admin/registers`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(data),
  });
  const json = await parseResponse(res);
  return json.data ?? null;
}

// ── PUT /api/admin/registers/:id ─────────────────────────────────────────────

/**
 * Update a register entry (filed_date, ack_number, error_number, …).
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<Object>} updated row
 */
export async function updateRegister(id, data) {
  const res  = await fetch(`${API_BASE}/api/admin/registers/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(data),
  });
  const json = await parseResponse(res);
  return json.data ?? null;
}

// ── DELETE /api/admin/registers/:id ──────────────────────────────────────────

export async function deleteRegister(id) {
  const res  = await fetch(`${API_BASE}/api/admin/registers/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
