/**
 * leadService.js
 *
 * API helpers for the Leads resource.
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
 * Map an API lead row to the shape expected by the UI.
 */
function normalizeLead(l) {
  return {
    id:              l.id,
    contactName:     l.name             || l.contact_name || 'Unknown',
    company:         l.company          || '',
    email:           l.email            || '',
    phone:           l.phone            || '',
    source:          l.source           || '',
    stage:           l.status           || l.stage || 'new',
    probability:     l.probability      || 50,
    estimatedValue:  parseFloat(l.estimated_value || 0),
    assignedTo:      l.assigned_to_name || l.assigned_to || '',
    nextFollowUp:    l.follow_up_date   || l.next_follow_up || '',
    notes:           l.notes            || '',
    createdAt:       l.created_at       || '',
  };
}

/**
 * Fetch the list of leads.
 * @returns {Promise<object[]>}
 */
export async function getLeads({ page = 1, perPage = 100, search = '', stage = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set('search', search);
  if (stage && stage !== 'all') params.set('status', stage);

  const res = await fetch(`${API_BASE}/admin/leads?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeLead);
}

/**
 * Create a new lead.
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createLead(payload) {
  const body = {
    name:            payload.contactName    || payload.name || '',
    company:         payload.company        || null,
    email:           payload.email          || null,
    phone:           payload.phone          || null,
    source:          payload.source         || null,
    status:          payload.stage          || 'new',
    probability:     payload.probability    || 50,
    estimated_value: parseFloat(payload.estimatedValue || 0) || null,
    assigned_to:     payload.assignedTo     || null,
    follow_up_date:  payload.nextFollowUp   || null,
    notes:           payload.notes          || null,
  };

  const res = await fetch(`${API_BASE}/admin/leads`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeLead(data.data);
}

/**
 * Update an existing lead.
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateLead(id, payload) {
  const body = {
    name:            payload.contactName   || payload.name || null,
    company:         payload.company       || null,
    email:           payload.email         || null,
    phone:           payload.phone         || null,
    source:          payload.source        || null,
    status:          payload.stage         || null,
    probability:     payload.probability   || null,
    estimated_value: payload.estimatedValue != null ? parseFloat(payload.estimatedValue) : null,
    assigned_to:     payload.assignedTo    || null,
    follow_up_date:  payload.nextFollowUp  || null,
    notes:           payload.notes         || null,
  };

  const res = await fetch(`${API_BASE}/admin/leads/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeLead(data.data);
}
