/**
 * officeCalendarService.js — firm-wide weekly off days and holidays for shift targets.
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
    const msg = json.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * @param {{ from?: string, to?: string }} [opts]
 * @returns {Promise<{ weekly_off_days: number, weekly_off_labels: string[], weekday_options: Array, holidays: Array }>}
 */
export async function getOfficeCalendar({ from = '', to = '' } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/admin/settings/office-calendar${qs}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data ?? json;
}

/**
 * @param {number} weeklyOffDays Bitmask
 */
export async function updateOfficeCalendarWeeklyOff(weeklyOffDays) {
  const res = await fetch(`${API_BASE}/admin/settings/office-calendar`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ weekly_off_days: weeklyOffDays }),
  });
  const json = await parseResponse(res);
  return json.data ?? json;
}

/**
 * @param {{ date: string, name: string }} payload
 */
export async function addOfficeHoliday({ date, name }) {
  const res = await fetch(`${API_BASE}/admin/settings/office-calendar/holidays`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ holiday_date: date, name }),
  });
  const json = await parseResponse(res);
  return json.data ?? json;
}

export async function deleteOfficeHoliday(id) {
  const res = await fetch(`${API_BASE}/admin/settings/office-calendar/holidays/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
