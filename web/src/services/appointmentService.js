/**
 * appointmentService.js
 *
 * API helpers for the Appointments (calendar_events) resource.
 * Calls the PHP backend when VITE_API_BASE_URL is set.
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

/**
 * Map an API appointment row to the shape expected by the UI.
 */
function normalizeAppointment(a) {
  return {
    id:          a.id,
    clientName:  a.client_name  || a.title || 'Unknown',
    staffName:   a.staff_name   || a.assigned_to_name || '',
    date:        a.event_date   || a.date  || '',
    startTime:   a.start_time   || '',
    endTime:     a.end_time     || '',
    mode:        a.event_type   || a.mode  || 'in_person',
    subject:     a.description  || a.subject || a.title || '',
    status:      a.status       || 'scheduled',
    clientId:    a.client_id    || null,
    createdAt:   a.created_at   || '',
  };
}

/**
 * Fetch the list of appointments.
 * @returns {Promise<object[]>}
 */
export async function getAppointments({ page = 1, perPage = 100, search = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set('search', search);

  const res = await fetch(`${API_BASE}/admin/appointments?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeAppointment);
}

/**
 * Create a new appointment.
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createAppointment(payload) {
  const body = {
    title:        payload.subject   || payload.title || '',
    description:  payload.subject   || '',
    event_date:   payload.date      || '',
    start_time:   payload.startTime || null,
    end_time:     payload.endTime   || null,
    event_type:   payload.mode      || 'in_person',
    client_name:  payload.clientName || null,
    staff_name:   payload.staffName  || null,
    status:       payload.status     || 'scheduled',
  };

  const res = await fetch(`${API_BASE}/admin/appointments`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeAppointment(data.data);
}

/**
 * Update an existing appointment.
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateAppointment(id, payload) {
  const body = {
    title:       payload.subject    || payload.title || null,
    description: payload.subject    || null,
    event_date:  payload.date       || null,
    start_time:  payload.startTime  || null,
    end_time:    payload.endTime    || null,
    event_type:  payload.mode       || null,
    client_name: payload.clientName || null,
    staff_name:  payload.staffName  || null,
    status:      payload.status     || null,
  };

  const res = await fetch(`${API_BASE}/admin/appointments/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeAppointment(data.data);
}

/**
 * Delete an appointment.
 * @param {number|string} id
 */
export async function deleteAppointment(id) {
  const res = await fetch(`${API_BASE}/admin/appointments/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
