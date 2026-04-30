/**
 * recurringServiceDefinitionService.js
 *
 * API helpers for Recurring Service Definitions.
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

// ── LIST ──────────────────────────────────────────────────────────────────────

/**
 * @param {Object} params
 * @param {boolean} [params.is_active]
 * @param {number}  [params.client_id]
 * @param {number}  [params.organization_id]
 * @param {number}  [params.engagement_type_id]
 * @param {string}  [params.frequency]
 * @param {string}  [params.register_category]
 * @param {string}  [params.search]
 * @param {number}  [params.page]
 * @param {number}  [params.per_page]
 *
 * @returns {Promise<{rows: Array, pagination: Object}>}
 */
export async function getRecurringServices(params = {}) {
  const res  = await fetch(`${API_BASE}/api/admin/recurring-services${buildQuery(params)}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return {
    rows:       json.data ?? [],
    pagination: json.pagination ?? { page: 1, per_page: 50, total: 0, last_page: 1 },
  };
}

// ── GET single ────────────────────────────────────────────────────────────────

export async function getRecurringService(id) {
  const res  = await fetch(`${API_BASE}/api/admin/recurring-services/${id}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? null;
}

// ── CREATE ────────────────────────────────────────────────────────────────────

/**
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function createRecurringService(data) {
  const res  = await fetch(`${API_BASE}/api/admin/recurring-services`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(data),
  });
  const json = await parseResponse(res);
  return json.data ?? null;
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

/**
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateRecurringService(id, data) {
  const res  = await fetch(`${API_BASE}/api/admin/recurring-services/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(data),
  });
  const json = await parseResponse(res);
  return json.data ?? null;
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function deleteRecurringService(id) {
  const res  = await fetch(`${API_BASE}/api/admin/recurring-services/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

// ── GENERATE PERIODS ──────────────────────────────────────────────────────────

/**
 * Trigger period generation for a definition.
 * @param {number} id
 * @param {string} [upToDate]  YYYY-MM-DD; defaults to 1 year from today on the server
 * @returns {Promise<{inserted: number, up_to_date: string}>}
 */
export async function generatePeriods(id, upToDate) {
  const body = upToDate ? { up_to_date: upToDate } : {};
  const res  = await fetch(`${API_BASE}/api/admin/recurring-services/${id}/generate`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const json = await parseResponse(res);
  return json.data ?? { inserted: 0 };
}
