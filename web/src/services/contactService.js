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
    const err = new Error(json.message || `Request failed (${res.status})`);
    if (json.data !== undefined && json.data !== null) {
      err.data = json.data;
    }
    throw err;
  }
  return json;
}

function toPositiveIntOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {unknown} val */
function coerceIdArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      if (Array.isArray(p)) return coerceIdArray(p);
    } catch {
      /* ignore */
    }
  }
  if (typeof val === 'object') {
    return Object.values(/** @type {object} */ (val))
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  return [];
}

/** @param {unknown} val */
function coerceNameArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.map((s) => (s == null ? '' : String(s))).filter(Boolean);
  }
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      if (Array.isArray(p)) return coerceNameArray(p);
    } catch {
      /* ignore */
    }
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof val === 'object') {
    return Object.values(/** @type {object} */ (val))
      .map((s) => String(s))
      .filter(Boolean);
  }
  return [];
}

/** Derive list/edit status from API row (`contact_status` + legacy `is_active`). */
function lifecycleStatusFromApi(c) {
  const cs = String(c.contact_status ?? c.status ?? '').trim().toLowerCase();
  if (cs === 'active' || cs === 'inactive' || cs === 'prospect') {
    return cs;
  }
  return c.is_active === false ? 'inactive' : 'active';
}

/**
 * Map an API contact row to the shape expected by the UI.
 * @param {object} c  Raw row from the backend.
 */
function normalizeContact(c) {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  const displayName = c.organization_name || parts.join(' ') || 'Unknown';
  const linkedOrgIds = coerceIdArray(c.linked_org_ids);
  let linkedOrgNames = coerceNameArray(c.linked_org_names);
  if (linkedOrgIds.length > linkedOrgNames.length) {
    linkedOrgNames = linkedOrgIds.map(
      (id, i) => linkedOrgNames[i] || `Organization #${id}`,
    );
  } else if (linkedOrgNames.length > linkedOrgIds.length) {
    linkedOrgNames = linkedOrgNames.slice(0, linkedOrgIds.length);
  }
  const linkedOrgsCount = linkedOrgIds.length;
  const organisation =
    linkedOrgsCount === 1 ? linkedOrgNames[0] || '' : '';
  return {
    id:            c.id,
    clientCode:    c.client_code || `CLT-${String(c.id).padStart(4, '0')}`,
    displayName,
    mobile:        c.phone  || '',
    email:         c.email  || '',
    pan:           c.pan    || '',
    gstin:         c.gstin  || '',
    website:       c.website || '',
    addressLine1:  c.address_line1 || '',
    addressLine2:  c.address_line2 || '',
    city:          c.city   || '',
    state:         c.state  || '',
    pincode:       c.pincode || '',
    country:       c.country || 'India',
    landline:      c.landline || '',
    secondaryMobile: c.secondary_mobile || '',
    waMobile:      c.wa_mobile || '',
    notes:         c.notes  || '',
    reference:     c.reference || '',
    linkedOrgIds,
    linkedOrgNames,
    linkedOrgsCount,
    organisation,
    assignedManager: c.assigned_manager || c.created_by_name || '',
    status:        lifecycleStatusFromApi(c),
    createdAt:     c.created_at || '',
    groupId:       c.group_id ?? null,
    groupName:     c.group_name || '',
    referringAffiliateUserId: c.referring_affiliate_user_id ?? null,
    referralStartDate: c.referral_start_date || '',
    commissionMode: c.commission_mode || 'referral_only',
    clientFacingRestricted: Boolean(c.client_facing_restricted),
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
 * Type-ahead contact search (GET /admin/contacts/search?q=&limit=).
 * @param {string} q
 * @param {number} limit  Capped at 50 server-side.
 * @returns {Promise<{ id: number, displayName: string }[]>}
 */
export async function searchContactsQuick(q, limit = 20) {
  const trimmed = (q || '').trim();
  if (!trimmed) return [];
  const cap = Math.min(50, Math.max(1, limit));
  try {
    const params = new URLSearchParams({ q: trimmed, limit: String(cap) });
    const res = await fetch(`${API_BASE}/admin/contacts/search?${params}`, {
      headers: authHeaders(),
    });
    const data = await parseResponse(res);
    return (data.data || []).map((c) => {
      const parts = [c.first_name, c.last_name].filter(Boolean);
      return {
        id: Number(c.id),
        displayName: c.organization_name || parts.join(' ') || 'Unknown',
        pan: c.pan != null ? String(c.pan) : '',
        email: c.email != null ? String(c.email) : '',
        mobile: c.phone != null ? String(c.phone) : '',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Merge paginated list search + quick search, deduped by id (for large directories).
 * @param {string} q
 * @param {number} perPage
 * @returns {Promise<{ id: number, displayName: string, pan?: string, email?: string, mobile?: string }[]>}
 */
export async function getContactsForSearch(q, perPage = 50) {
  const trimmed = (q || '').trim();
  if (trimmed.length < 1) return [];
  const listCap = Math.min(100, Math.max(1, perPage));
  const quickCap = Math.min(50, Math.max(1, perPage));
  const [fromList, fromQuick] = await Promise.all([
    getContacts({ search: trimmed, perPage: listCap }).catch(() => []),
    searchContactsQuick(trimmed, quickCap).catch(() => []),
  ]);
  const map = new Map();
  for (const c of fromList) {
    if (c && c.id != null) {
      const id = Number(c.id);
      if (Number.isFinite(id) && id > 0) {
        map.set(id, {
          id,
          displayName: c.displayName || 'Unknown',
          pan: c.pan != null ? String(c.pan) : '',
          email: c.email != null ? String(c.email) : '',
          mobile: c.mobile != null ? String(c.mobile) : '',
        });
      }
    }
  }
  for (const c of fromQuick) {
    if (c && c.id != null) {
      const id = Number(c.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const prev = map.get(id);
      if (prev) {
        map.set(id, {
          ...prev,
          displayName: prev.displayName || c.displayName || 'Unknown',
          pan: prev.pan || c.pan || '',
          email: prev.email || c.email || '',
          mobile: prev.mobile || c.mobile || '',
        });
      } else {
        map.set(id, {
          id,
          displayName: c.displayName || 'Unknown',
          pan: c.pan || '',
          email: c.email || '',
          mobile: c.mobile || '',
        });
      }
    }
  }
  return [...map.values()];
}

/**
 * GET /admin/contacts/check-pan — another contact with this PAN (normalized)?
 * @param {string} pan
 * @param {number|string|null} excludeId  Current contact id when editing
 * @returns {Promise<null | { id: number, label: string, pan: string, email: string, mobile: string }>}
 */
export async function checkContactPanConflict(pan, excludeId = null) {
  const p = (pan || '').trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) return null;
  const params = new URLSearchParams({ pan: p });
  const ex = excludeId != null && excludeId !== '' ? Number(excludeId) : NaN;
  if (Number.isFinite(ex) && ex > 0) {
    params.set('exclude_id', String(ex));
  }
  const res = await fetch(`${API_BASE}/admin/contacts/check-pan?${params}`, {
    headers: authHeaders(),
  });
  const envelope = await parseResponse(res);
  const conflict = envelope.data && envelope.data.conflict;
  if (!conflict) return null;
  return {
    id: Number(conflict.id),
    label: conflict.display_name || '—',
    pan: conflict.pan != null ? String(conflict.pan) : '',
    email: conflict.email != null ? String(conflict.email) : '',
    mobile: conflict.phone != null ? String(conflict.phone) : '',
  };
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
    website:           payload.website || null,
    city:              payload.city    || null,
    state:             payload.state   || null,
    country:           payload.country || 'India',
    notes:             payload.notes   || null,
    reference:         payload.reference || null,
    contact_status:    payload.status ?? null,
    is_active:         payload.status !== 'inactive',
    assigned_manager:  payload.assignedManager || null,
    linked_org_ids:    payload.linkedOrgIds    || [],
    group_id:          toPositiveIntOrNull(payload.groupId ?? payload.group_id),
    referring_affiliate_user_id: payload.referringAffiliateUserId != null && payload.referringAffiliateUserId !== ''
      ? Number(payload.referringAffiliateUserId) : null,
    referral_start_date: payload.referralStartDate || null,
    commission_mode: payload.commissionMode || 'referral_only',
    client_facing_restricted: Boolean(payload.clientFacingRestricted),
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
  if (hasOwn(payload, 'website')) body.website = payload.website ?? null;
  if (hasOwn(payload, 'city')) body.city = payload.city ?? null;
  if (hasOwn(payload, 'state')) body.state = payload.state ?? null;
  if (hasOwn(payload, 'country')) body.country = payload.country ?? 'India';
  if (hasOwn(payload, 'notes')) body.notes = payload.notes ?? null;
  if (hasOwn(payload, 'reference')) body.reference = payload.reference ?? null;
  if (hasOwn(payload, 'status')) {
    body.contact_status = payload.status;
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
    body.group_id = toPositiveIntOrNull(payload.groupId ?? payload.group_id);
  }
  if (hasOwn(payload, 'referringAffiliateUserId')) {
    const v = payload.referringAffiliateUserId;
    body.referring_affiliate_user_id = v === '' || v == null ? null : Number(v);
  }
  if (hasOwn(payload, 'referralStartDate')) body.referral_start_date = payload.referralStartDate || null;
  if (hasOwn(payload, 'commissionMode')) body.commission_mode = payload.commissionMode || 'referral_only';
  if (hasOwn(payload, 'clientFacingRestricted')) body.client_facing_restricted = Boolean(payload.clientFacingRestricted);

  const res = await fetch(`${API_BASE}/admin/contacts/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeContact(data.data);
}

/** POST — super admin receives OTP email to authorize contact delete */
export async function requestContactDeleteOtp(id) {
  const res = await fetch(`${API_BASE}/admin/contacts/${id}/request-delete-otp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/**
 * Permanently delete a contact (DELETE /admin/contacts/:id).
 * Requires a valid superadmin OTP from requestContactDeleteOtp (X-Superadmin-Otp header).
 * @param {number|string} id
 * @param {{ superadminOtp?: string }} [opts]
 */
export async function deleteContact(id, { superadminOtp } = {}) {
  const headers = { ...authHeaders() };
  if (superadminOtp) {
    headers['X-Superadmin-Otp'] = String(superadminOtp).trim();
  }
  const res = await fetch(`${API_BASE}/admin/contacts/${id}`, {
    method: 'DELETE',
    headers,
  });
  await parseResponse(res);
}
