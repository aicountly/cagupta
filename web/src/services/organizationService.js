/**
 * organizationService.js
 *
 * API helpers for the Organizations resource.
 * Calls the PHP backend when VITE_API_BASE_URL is set.
 */

import { API_BASE_URL } from '../constants/config';

const API_BASE = API_BASE_URL;

/** Thrown on non-OK API responses; includes HTTP status and parsed JSON body. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {Record<string, unknown>} body
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

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
    throw new ApiError(json.message || `Request failed (${res.status})`, res.status, json);
  }
  return json;
}

/** Avoid sending 0 / invalid FK ids to the API. */
function toPositiveIntOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Tri-state org status from API row (`organization_status` + legacy `is_active`). */
function organizationTriStatus(o) {
  const s = String(o.organization_status ?? '').trim().toLowerCase();
  if (s === 'inactive' || s === 'prospect' || s === 'active') return s;
  const inactive = o.is_active === false || o.is_active === 'f' || o.is_active === 'false';
  return inactive ? 'inactive' : 'active';
}

function payloadOrganizationStatus(payload) {
  const s = payload?.status;
  return s === 'active' || s === 'inactive' || s === 'prospect' ? s : 'active';
}

/**
 * Map an API organization row to the shape expected by the UI.
 */
function normalizeOrg(o) {
  return {
    id:               Number(o.id),
    clientCode:       o.client_code || `ORG-${String(o.id).padStart(4, '0')}`,
    displayName:      o.name || 'Unknown',
    constitution:     o.type        || '',
    pan:              o.pan         || '',
    gstin:            o.gstin       || '',
    cin:              o.cin         || '',
    email:            o.email       || '',
    phone:            o.phone       || '',
    website:          o.website     || '',
    city:             o.city        || '',
    state:            o.state       || '',
    country:          o.country     || 'India',
    pincode:          o.pincode     || '',
    pin:              o.pincode     || '',
    address:          o.address     || '',
    addressLine1:     o.address_line1 || o.address || '',
    addressLine2:     o.address_line2 || '',
    notes:            o.notes       || '',
    reference:        o.reference   || '',
    primaryContact:   o.primary_contact_name || o.primary_contact || '—',
    primaryContactId: o.primary_contact_id || null,
    assignedManager:  o.assigned_manager || o.created_by_name || '',
    status:           organizationTriStatus(o),
    createdAt:        o.created_at  || '',
    groupId:          o.group_id ?? null,
    groupName:        o.group_name || '',
    referringAffiliateUserId: o.referring_affiliate_user_id ?? null,
    referralStartDate: o.referral_start_date || '',
    commissionMode: o.commission_mode || 'referral_only',
    clientFacingRestricted: Boolean(o.client_facing_restricted),
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
 * Fetch one organization by id.
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function getOrganization(id) {
  const res = await fetch(`${API_BASE}/admin/organizations/${id}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return normalizeOrg(data.data);
}

/**
 * Type-ahead organization search (GET /admin/organizations/search?q=&limit=).
 * Same API as EntitySearchDropdown; useful when the paginated list endpoint
 * returns nothing or errors in some environments.
 */
export async function searchOrganizationsQuick(q, limit = 20) {
  const trimmed = (q || '').trim();
  if (!trimmed) return [];
  const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
  const res = await fetch(`${API_BASE}/admin/organizations/search?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeOrg);
}

/**
 * Merge paginated list + quick search, deduped by id (for global search UIs).
 */
export async function getOrganizationsForSearch(q, perPage = 50) {
  const trimmed = (q || '').trim();
  if (trimmed.length < 2) return [];
  const [fromList, fromQuick] = await Promise.all([
    getOrganizations({ search: trimmed, perPage }).catch(() => []),
    searchOrganizationsQuick(trimmed, perPage).catch(() => []),
  ]);
  const map = new Map();
  for (const o of [...fromList, ...fromQuick]) {
    if (o && o.id != null) map.set(Number(o.id), o);
  }
  return [...map.values()];
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
    cin:                 payload.cin         || null,
    email:               payload.email       || null,
    phone:               payload.phone       || null,
    address:             payload.addressLine1 ? [payload.addressLine1, payload.addressLine2].filter(Boolean).join(', ') : (payload.address || null),
    city:                payload.city        || null,
    state:               payload.state       || null,
    country:             payload.country     || 'India',
    pincode:             payload.pin         || payload.pincode || null,
    website:             payload.website     || null,
    notes:               payload.notes       || null,
    reference:           payload.reference   || null,
    organization_status: payloadOrganizationStatus(payload),
    is_active:           payloadOrganizationStatus(payload) !== 'inactive',
    primary_contact_id:  toPositiveIntOrNull(payload.primaryContactId ?? payload.primary_contact_id),
    assigned_manager:    payload.assignedManager   || null,
    group_id:            toPositiveIntOrNull(payload.groupId ?? payload.group_id),
    referring_affiliate_user_id: payload.referringAffiliateUserId != null && payload.referringAffiliateUserId !== ''
      ? Number(payload.referringAffiliateUserId) : null,
    referral_start_date: payload.referralStartDate || null,
    commission_mode: payload.commissionMode || 'referral_only',
    client_facing_restricted: Boolean(payload.clientFacingRestricted),
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
    cin:                payload.cin     || null,
    email:              payload.email   || null,
    phone:              payload.phone   || null,
    address:            payload.addressLine1 ? [payload.addressLine1, payload.addressLine2].filter(Boolean).join(', ') : (payload.address || null),
    city:               payload.city    || null,
    state:              payload.state   || null,
    country:            payload.country || 'India',
    pincode:            payload.pin     || payload.pincode || null,
    website:            payload.website || null,
    notes:              payload.notes   || null,
    reference:          payload.reference || null,
    organization_status: payloadOrganizationStatus(payload),
    is_active:          payloadOrganizationStatus(payload) !== 'inactive',
    primary_contact_id: toPositiveIntOrNull(payload.primaryContactId ?? payload.primary_contact_id),
    assigned_manager:   payload.assignedManager  || null,
    group_id:           toPositiveIntOrNull(payload.groupId ?? payload.group_id),
    referring_affiliate_user_id: payload.referringAffiliateUserId != null && payload.referringAffiliateUserId !== ''
      ? Number(payload.referringAffiliateUserId) : null,
    referral_start_date: payload.referralStartDate || null,
    commission_mode: payload.commissionMode || 'referral_only',
    client_facing_restricted: Boolean(payload.clientFacingRestricted),
  };

  const res = await fetch(`${API_BASE}/admin/organizations/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeOrg(data.data);
}

/** POST — super admin receives OTP email to authorize organization delete */
export async function requestOrganizationDeleteOtp(id) {
  const res = await fetch(`${API_BASE}/admin/organizations/${id}/request-delete-otp`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({}),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/** DELETE — requires superadminOtp in header (same pattern as invoice delete) */
export async function deleteOrganization(id, { superadminOtp } = {}) {
  const headers = { ...authHeaders() };
  if (superadminOtp) {
    headers['X-Superadmin-Otp'] = String(superadminOtp).trim();
  }
  const res = await fetch(`${API_BASE}/admin/organizations/${id}`, {
    method:  'DELETE',
    headers,
  });
  await parseResponse(res);
}
