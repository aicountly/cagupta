/**
 * Appointment fee rule templates (PHP API).
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

/** @returns {Promise<object[]>} */
export async function getAppointmentFeeRules({ includeInactive = false } = {}) {
  const q = includeInactive ? '?all=1' : '';
  const res = await fetch(`${API_BASE}/admin/appointment-fee-rules${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function createAppointmentFeeRule(payload) {
  const res = await fetch(`${API_BASE}/admin/appointment-fee-rules`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function updateAppointmentFeeRule(id, payload) {
  const res = await fetch(`${API_BASE}/admin/appointment-fee-rules/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function deleteAppointmentFeeRule(id) {
  const res = await fetch(`${API_BASE}/admin/appointment-fee-rules/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
