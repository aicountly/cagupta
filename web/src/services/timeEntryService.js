/**
 * Time entries API (service engagements).
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
    const err = new Error(json.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = json.data;
    throw err;
  }
  return json;
}

export const TIME_ACTIVITY_TYPES = [
  { value: 'client_work', label: 'Client work' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'coordination', label: 'Coordination' },
  { value: 'research', label: 'Research' },
  { value: 'compliance_prep', label: 'Compliance preparation' },
  { value: 'other', label: 'Other' },
];

function mapTimeEntry(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name || '',
    serviceId: r.service_id,
    serviceType: r.service_type || '',
    clientName: r.client_name || '',
    taskId: r.task_id || null,
    workDate: r.work_date || '',
    durationMinutes: Number(r.duration_minutes) || 0,
    activityType: r.activity_type || '',
    isBillable: Boolean(r.is_billable),
    notes: r.notes || '',
    startedAt: r.started_at || '',
    endedAt: r.ended_at || '',
    timerStatus: r.timer_status || 'submitted',
    source: r.source || 'manual',
    createdAt: r.created_at || '',
  };
}

/**
 * @param {number|string} serviceId
 * @returns {Promise<object[]>}
 */
export async function getTimeEntries(serviceId) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/time-entries`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return (json.data || []).map(mapTimeEntry);
}

/**
 * @param {number|string} serviceId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createTimeEntry(serviceId, payload) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/time-entries`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return mapTimeEntry(json.data);
}

/**
 * @returns {Promise<object|null>}
 */
export async function getActiveTimer() {
  const res = await fetch(`${API_BASE}/admin/time-entries/active`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return mapTimeEntry(json.data);
}

/**
 * @param {number|string} serviceId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function startTimer(serviceId, payload = {}) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/time-entries/start`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return mapTimeEntry(json.data);
}

/**
 * @param {number|string} serviceId
 * @param {number|string} entryId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function stopTimer(serviceId, entryId, payload = {}) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/time-entries/${entryId}/stop`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return mapTimeEntry(json.data);
}

/**
 * @param {number|string} serviceId
 * @param {number|string} entryId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateTimeEntry(serviceId, entryId, payload) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/time-entries/${entryId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await parseResponse(res);
  return mapTimeEntry(json.data);
}

/**
 * @param {{ userId?: number|string, dateFrom: string, dateTo: string }} params
 * @returns {Promise<object[]>}
 */
export async function getTimeEntryReport({ userId, dateFrom, dateTo }) {
  const q = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  if (userId != null && String(userId).trim() !== '') {
    const n = Number(userId);
    if (Number.isFinite(n) && n > 0) q.set('user_id', String(n));
  }
  const res = await fetch(`${API_BASE}/admin/time-entries/report?${q}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return (json.data || []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name || '',
    serviceId: r.service_id,
    serviceType: r.service_type || '',
    clientName: r.client_name || '',
    groupId: r.group_id != null ? Number(r.group_id) : null,
    groupName: r.group_name || '',
    billableMinutes: Number(r.billable_minutes) || 0,
    nonBillableMinutes: Number(r.non_billable_minutes) || 0,
  }));
}

function addOptionalQuery(q, key, value) {
  if (value == null) return;
  const raw = String(value).trim();
  if (raw === '') return;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    q.set(key, String(n));
  }
}

/**
 * @param {{
 *   dateFrom: string,
 *   dateTo: string,
 *   bucket?: 'daily'|'weekly'|'monthly',
 *   billableType?: 'all'|'billable'|'non_billable',
 *   userId?: number|string,
 *   clientId?: number|string,
 *   organizationId?: number|string,
 *   serviceId?: number|string,
 *   groupId?: number|string
 * }} params
 * @returns {Promise<object>}
 */
export async function getTimesheetInsights(params) {
  const q = new URLSearchParams({
    date_from: params.dateFrom,
    date_to: params.dateTo,
    bucket: params.bucket || 'weekly',
    billable_type: params.billableType || 'all',
  });
  addOptionalQuery(q, 'user_id', params.userId);
  addOptionalQuery(q, 'client_id', params.clientId);
  addOptionalQuery(q, 'organization_id', params.organizationId);
  addOptionalQuery(q, 'service_id', params.serviceId);
  addOptionalQuery(q, 'group_id', params.groupId);

  const res = await fetch(`${API_BASE}/admin/reports/timesheets/insights?${q.toString()}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || {};
}
