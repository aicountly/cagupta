/**
 * organizationService.js
 *
 * API helpers for the Organizations resource.
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
 * Map an API organization row to the shape expected by the UI.
 */
function normalizeOrg(o) {
  return {
    id:               o.id,
    clientCode:       o.client_code || `ORG-${String(o.id).padStart(4, '0')}`,
    displayName:      o.name || 'Unknown',
    constitution:     o.type        || '',
    pan:              o.pan         || '',
    gstin:            o.gstin       || '',
    email:            o.email       || '',
    phone:            o.phone       || '',
    website:          o.website     || '',
    city:             o.city        || '',
    state:            o.state       || '',
    pincode:          o.pincode     || '',
    address:          o.address     || '',
    notes:            o.notes       || '',
    primaryContact:   o.primary_contact || '—',
    primaryContactId: o.primary_contact_id || null,
    assignedManager:  o.assigned_manager || o.created_by_name || '',
    status:           o.is_active === false ? 'inactive' : (o.is_active === true ? 'active' : (o.status || 'active')),
    createdAt:        o.created_at  || '',
  };
}

/**
 * Fetch the list of organizations from the API.
 * @returns {Promise<object[]>}
 */
export async function getOrganizations({ page = 1, perPage = 100, search = '', status = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);

  const res = await fetch(`${API_BASE}/admin/organizations?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeOrg);
}

/**
 * Create a new organization.
 * @param {object} payload  Fields from OrganizationCreatePage form.
 * @returns {Promise<object>}  The created org (normalised).
 */
export async function createOrganization(payload) {
  const body = {
    name:                payload.displayName || payload.name,
    type:                payload.constitution || payload.type || null,
    gstin:               payload.gstin       || null,
    pan:                 payload.pan         || null,
    email:               payload.email       || null,
    phone:               payload.phone       || null,
    address:             payload.addressLine1 ? [payload.addressLine1, payload.addressLine2].filter(Boolean).join(', ') : (payload.address || null),
    city:                payload.city        || null,
    state:               payload.state       || null,
    pincode:             payload.pin         || payload.pincode || null,
    website:             payload.website     || null,
    notes:               payload.notes       || null,
    is_active:           payload.status !== 'inactive',
    primary_contact_id:  payload.primaryContactId  || null,
    assigned_manager:    payload.assignedManager   || null,
  };

  const res = await fetch(`${API_BASE}/admin/organizations`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeOrg(data.data);
}

/**
 * Update an existing organization.
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateOrganization(id, payload) {
  const body = {
    name:               payload.displayName || payload.name || null,
    type:               payload.constitution || payload.type || null,
    gstin:              payload.gstin   || null,
    pan:                payload.pan     || null,
    email:              payload.email   || null,
    phone:              payload.phone   || null,
    address:            payload.addressLine1 ? [payload.addressLine1, payload.addressLine2].filter(Boolean).join(', ') : (payload.address || null),
    city:               payload.city    || null,
    state:              payload.state   || null,
    pincode:            payload.pin     || payload.pincode || null,
    website:            payload.website || null,
    notes:              payload.notes   || null,
    is_active:          payload.status !== 'inactive',
    primary_contact_id: payload.primaryContactId || null,
    assigned_manager:   payload.assignedManager  || null,
  };

  const res = await fetch(`${API_BASE}/admin/organizations/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeOrg(data.data);
}
