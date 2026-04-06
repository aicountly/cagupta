/**
 * engagementService.js
 *
 * API helpers for the Services / Engagements resource (maps to the `services` table).
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
 * Map an API service row to the shape expected by the Services/Engagements UI.
 */
function normalizeEngagement(s) {
  return {
    id:                 s.id,
    clientType:         s.client_type         || 'contact',
    clientId:           s.client_id           || s.organization_id || null,
    clientName:         s.client_name         || s.organization_name || 'Unknown',
    categoryId:         s.category_id         || '',
    categoryName:       s.category_name       || '',
    subcategoryId:      s.subcategory_id      || '',
    subcategoryName:    s.subcategory_name    || '',
    engagementTypeId:   s.engagement_type_id  || '',
    engagementTypeName: s.engagement_type_name || '',
    type:               s.service_type        || s.type || '',
    financialYear:      s.financial_year      || '',
    assignedTo:         s.assigned_to_name    || s.assigned_to || '',
    dueDate:            s.due_date            || '',
    status:             s.status              || 'not_started',
    feeAgreed:          s.fees                || s.fee_agreed || null,
    notes:              s.notes               || '',
    tasks:              s.tasks               || [],
    createdAt:          s.created_at          || '',
  };
}

/**
 * Fetch the list of service engagements.
 * @returns {Promise<object[]>}
 */
export async function getEngagements({ page = 1, perPage = 100, search = '', status = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);

  const res = await fetch(`${API_BASE}/admin/services?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeEngagement);
}

/**
 * Create a new service engagement.
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createEngagement(payload) {
  const body = {
    client_type:          payload.clientType         || 'contact',
    client_id:            payload.clientType === 'contact' ? (payload.clientId || null) : null,
    organization_id:      payload.clientType === 'organization' ? (payload.clientId || null) : null,
    client_name:          payload.clientName          || null,
    category_id:          payload.categoryId          || null,
    category_name:        payload.categoryName        || null,
    subcategory_id:       payload.subcategoryId       || null,
    subcategory_name:     payload.subcategoryName     || null,
    engagement_type_id:   payload.engagementTypeId    || null,
    engagement_type_name: payload.engagementTypeName  || null,
    service_type:         payload.type                || null,
    financial_year:       payload.financialYear       || null,
    assigned_to:          payload.assignedTo          || null,
    due_date:             payload.dueDate             || null,
    status:               payload.status              || 'not_started',
    fees:                 payload.feeAgreed           || null,
    notes:                payload.notes               || null,
    tasks:                payload.tasks               || [],
  };

  const res = await fetch(`${API_BASE}/admin/services`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeEngagement(data.data);
}

/**
 * Update an existing service engagement.
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateEngagement(id, payload) {
  const body = {
    status:        payload.status        || null,
    assigned_to:   payload.assignedTo    || null,
    due_date:      payload.dueDate       || null,
    fees:          payload.feeAgreed     || null,
    notes:         payload.notes         || null,
    tasks:         payload.tasks         || [],
  };

  const res = await fetch(`${API_BASE}/admin/services/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeEngagement(data.data);
}

/**
 * Add a task to an existing service engagement.
 * @param {number|string} engagementId
 * @param {object} taskData  { title, assignedTo?, dueDate?, priority? }
 * @returns {Promise<object>} Updated engagement after adding the task.
 */
export async function createTask(engagementId, taskData) {
  const body = {
    title:      taskData.title      || '',
    assignedTo: taskData.assignedTo || null,
    dueDate:    taskData.dueDate    || null,
    priority:   taskData.priority   || 'medium',
  };

  const res = await fetch(`${API_BASE}/admin/services/${engagementId}/tasks`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeEngagement(data.data);
}
