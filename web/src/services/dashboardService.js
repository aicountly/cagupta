/**
 * dashboardService.js
 *
 * API helpers for the Dashboard resource.
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
 * Fetch aggregate stats for the dashboard stat cards.
 * @returns {Promise<{activeClients: number, activeServices: number, pendingTasks: number, totalOutstanding: number, documentsThisMonth: number, appointmentsToday: number}>}
 */
export async function getDashboardStats() {
  const res = await fetch(`${API_BASE}/admin/dashboard/stats`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || {};
}
