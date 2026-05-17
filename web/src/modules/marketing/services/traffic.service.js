/**
 * traffic.service.js
 *
 * API helpers for Traffic Analytics and AI Insights.
 *
 *   GET  marketing/traffic/overview?days=30
 *   GET  marketing/traffic/sources?days=30
 *   GET  marketing/traffic/leads?days=30
 *   GET  marketing/ai-insights
 *   POST marketing/ai-insights/refresh
 */

import { API_BASE_URL } from '../../../constants/config';

const BASE = API_BASE_URL;

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

export async function fetchTrafficOverview({ days = 30, stream = 'all' } = {}) {
  const params = new URLSearchParams({ days, stream });
  const res = await fetch(`${BASE}/marketing/traffic/overview?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function fetchTrafficSources({ days = 30 } = {}) {
  const params = new URLSearchParams({ days });
  const res = await fetch(`${BASE}/marketing/traffic/sources?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function fetchTrafficLeads({ days = 30 } = {}) {
  const params = new URLSearchParams({ days });
  const res = await fetch(`${BASE}/marketing/traffic/leads?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function fetchAIInsights() {
  const res = await fetch(`${BASE}/marketing/ai-insights`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function refreshAIInsights() {
  const res = await fetch(`${BASE}/marketing/ai-insights/refresh`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}
