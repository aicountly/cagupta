/**
 * contactService.js
 *
 * API helpers for the Contacts (clients) resource.
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
 * Map an API contact row to the shape expected by the UI.
 * @param {object} c  Raw row from the backend.
 */
function normalizeContact(c) {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  const displayName = c.organization_name || parts.join(' ') || 'Unknown';
  const linkedOrgIds   = (c.linked_org_ids   || []).map(Number);
  const linkedOrgNames = c.linked_org_names || [];
  return {
    id:            c.id,
    clientCode:    c.client_code || `CLT-${String(c.id).padStart(4, '0')}`,
    displayName,
    mobile:        c.phone  || '',
    email:         c.email  || '',
    pan:           c.pan    || '',
    gstin:         c.gstin  || '',
    city:          c.city   || '',
    state:         c.state  || '',
    country:       c.country || 'India',
    landline:      c.landline || '',
    secondaryMobile: c.secondary_mobile || '',
    waMobile:      c.wa_mobile || '',
    notes:         c.notes  || '',
    reference:     c.reference || '',
    linkedOrgIds,
    linkedOrgNames,
    linkedOrgsCount: linkedOrgIds.length,
    organisation:  linkedOrgNames[0] || '',
    assignedManager: c.assigned_manager || c.created_by_name || '',
    status:        c.is_active === false ? 'inactive' : (c.is_active === true ? 'active' : (c.status || 'active')),
    createdAt:     c.created_at || '',
    groupId:       c.group_id ?? null,
  };
}

/**
 * Fetch the list of contacts from the API.
 * @returns {Promise<object[]>}
 */
export async function getContacts({ page = 1, perPage = 100, search = '', status = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search)  params.set('search', search);
  if (status && status !== 'all')  params.set('status', status);

  const res = await fetch(`${API_BASE}/admin/contacts?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeContact);
}

/**
 * Fetch one contact by id (for edit screen; avoids list pagination gaps).
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function getContact(id) {
  const res = await fetch(`${API_BASE}/admin/contacts/${id}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return normalizeContact(data.data);
}

/**
 * Create a new contact.
 * @param {object} payload  Fields from ContactCreatePage form.
 * @returns {Promise<object>}  The created contact (normalised).
 */
export async function createContact(payload) {
  // Map UI field names → backend field names
  const body = {
    type:              payload.type || 'individual',
    first_name:        payload.displayName || payload.first_name || null,
    last_name:         payload.last_name    || null,
    organization_name: payload.organization_name || null,
    email:             payload.email   || null,
    phone:             payload.mobile  || payload.phone || null,
    pan:               payload.pan     || null,
    gstin:             payload.gstin   || null,
    city:              payload.city    || null,
    state:             payload.state   || null,
    country:           payload.country || 'India',
    notes:             payload.notes   || null,
    reference:         payload.reference || null,
    is_active:         payload.status !== 'inactive',
    assigned_manager:  payload.assignedManager || null,
    linked_org_ids:    payload.linkedOrgIds    || [],
    group_id:          payload.groupId ?? null,
  };

  const res = await fetch(`${API_BASE}/admin/contacts`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeContact(data.data);
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

/**
 * Update an existing contact.
 * Only fields present on `payload` are sent, so partial updates (e.g. group_id only)
 * do not wipe other columns or clear linked organizations unintentionally.
 *
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateContact(id, payload) {
  const body = {};
  if (hasOwn(payload, 'displayName') || hasOwn(payload, 'first_name')) {
    body.first_name = payload.displayName ?? payload.first_name ?? null;
  }
  if (hasOwn(payload, 'last_name')) body.last_name = payload.last_name ?? null;
  if (hasOwn(payload, 'organization_name')) body.organization_name = payload.organization_name ?? null;
  if (hasOwn(payload, 'email')) body.email = payload.email ?? null;
  if (hasOwn(payload, 'mobile') || hasOwn(payload, 'phone')) {
    body.phone = payload.mobile ?? payload.phone ?? null;
  }
  if (hasOwn(payload, 'pan')) body.pan = payload.pan ?? null;
  if (hasOwn(payload, 'gstin')) body.gstin = payload.gstin ?? null;
  if (hasOwn(payload, 'city')) body.city = payload.city ?? null;
  if (hasOwn(payload, 'state')) body.state = payload.state ?? null;
  if (hasOwn(payload, 'country')) body.country = payload.country ?? 'India';
  if (hasOwn(payload, 'notes')) body.notes = payload.notes ?? null;
  if (hasOwn(payload, 'reference')) body.reference = payload.reference ?? null;
  if (hasOwn(payload, 'status')) {
    body.is_active = payload.status !== 'inactive';
  } else if (hasOwn(payload, 'is_active')) {
    body.is_active = Boolean(payload.is_active);
  }
  if (hasOwn(payload, 'assignedManager') || hasOwn(payload, 'assigned_manager')) {
    body.assigned_manager = payload.assignedManager ?? payload.assigned_manager ?? null;
  }
  if (hasOwn(payload, 'linkedOrgIds')) {
    body.linked_org_ids = payload.linkedOrgIds ?? [];
  }
  if (hasOwn(payload, 'groupId') || hasOwn(payload, 'group_id')) {
    body.group_id = payload.groupId ?? payload.group_id ?? null;
  }

  const res = await fetch(`${API_BASE}/admin/contacts/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeContact(data.data);
}
