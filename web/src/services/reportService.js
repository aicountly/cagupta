/**
 * Staff reports API (data exceptions, etc.).
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

function isBlank(v) {
  return v == null || String(v).trim() === '';
}

/**
 * @param {object} r
 * @returns {object}
 */
function normalizeContactExceptionRow(r) {
  return {
    id: Number(r.id),
    displayName: r.display_name || 'Unknown',
    email: r.email || '',
    pan: r.pan || '',
    gstin: r.gstin || '',
    website: r.website || '',
    groupName: r.group_name || '',
    contactStatus: r.contact_status || '',
    isActive: Boolean(r.is_active),
    missingFields: Array.isArray(r.missing_fields) ? r.missing_fields : [],
  };
}

/**
 * @param {object} r
 * @returns {object}
 */
function normalizeOrgExceptionRow(r) {
  return {
    id: Number(r.id),
    name: r.name || 'Unknown',
    email: r.email || '',
    pan: r.pan || '',
    gstin: r.gstin || '',
    cin: r.cin || '',
    website: r.website || '',
    groupName: r.group_name || '',
    isActive: Boolean(r.is_active),
    missingFields: Array.isArray(r.missing_fields) ? r.missing_fields : [],
  };
}

/**
 * @param {{ missingKeys: string[], page?: number, perPage?: number, includeInactive?: boolean }} p
 * @returns {Promise<{ rows: object[], pagination: object, missingApplied: string[] }>}
 */
export async function getContactExceptions({ missingKeys, page = 1, perPage = 20, includeInactive = false }) {
  const keys = (missingKeys || []).filter(Boolean);
  if (keys.length === 0) {
    throw new Error('Select at least one missing-field criterion.');
  }
  const params = new URLSearchParams({
    missing: keys.join(','),
    page: String(page),
    per_page: String(perPage),
  });
  if (includeInactive) params.set('include_inactive', '1');

  const res = await fetch(`${API_BASE}/admin/reports/contact-exceptions?${params}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  const rows = (json.data || []).map(normalizeContactExceptionRow);
  return {
    rows,
    pagination: json.pagination || {},
    missingApplied: json.missing_applied || keys,
  };
}

/**
 * @param {object} r
 * @returns {object}
 */
function normalizeContactKycExceptionRow(r) {
  return {
    id: Number(r.id),
    displayName: r.display_name || 'Unknown',
    email: r.email || '',
    contactStatus: r.contact_status || '',
    isActive: Boolean(r.is_active),
    groupName: r.group_name || '',
    missingCategories: Array.isArray(r.missing_categories) ? r.missing_categories : [],
  };
}

/**
 * @param {object} r
 * @returns {object}
 */
function normalizeOrgKycExceptionRow(r) {
  return {
    id: Number(r.id),
    name: r.name || 'Unknown',
    type: r.type || '',
    email: r.email || '',
    isActive: Boolean(r.is_active),
    groupName: r.group_name || '',
    missingCategories: Array.isArray(r.missing_categories) ? r.missing_categories : [],
  };
}

/**
 * @param {{ missingKeys: string[], page?: number, perPage?: number, includeInactive?: boolean }} p
 * @returns {Promise<{ rows: object[], pagination: object, missingApplied: string[] }>}
 */
export async function getContactKycExceptions({ missingKeys, page = 1, perPage = 20, includeInactive = false }) {
  const keys = (missingKeys || []).filter(Boolean);
  if (keys.length === 0) {
    throw new Error('Select at least one KYC category criterion.');
  }
  const params = new URLSearchParams({
    missing: keys.join(','),
    page: String(page),
    per_page: String(perPage),
  });
  if (includeInactive) params.set('include_inactive', '1');

  const res = await fetch(`${API_BASE}/admin/reports/contact-kyc-exceptions?${params}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  const rows = (json.data || []).map(normalizeContactKycExceptionRow);
  return {
    rows,
    pagination: json.pagination || {},
    missingApplied: json.missing_applied || keys,
  };
}

/**
 * @param {{ missingKeys: string[], page?: number, perPage?: number, includeInactive?: boolean }} p
 * @returns {Promise<{ rows: object[], pagination: object, missingApplied: string[] }>}
 */
export async function getOrganizationKycExceptions({ missingKeys, page = 1, perPage = 20, includeInactive = false }) {
  const keys = (missingKeys || []).filter(Boolean);
  if (keys.length === 0) {
    throw new Error('Select at least one KYC category criterion.');
  }
  const params = new URLSearchParams({
    missing: keys.join(','),
    page: String(page),
    per_page: String(perPage),
  });
  if (includeInactive) params.set('include_inactive', '1');

  const res = await fetch(`${API_BASE}/admin/reports/organization-kyc-exceptions?${params}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  const rows = (json.data || []).map(normalizeOrgKycExceptionRow);
  return {
    rows,
    pagination: json.pagination || {},
    missingApplied: json.missing_applied || keys,
  };
}

/**
 * @param {{ missingKeys: string[], page?: number, perPage?: number, includeInactive?: boolean }} p
 * @returns {Promise<{ rows: object[], pagination: object, missingApplied: string[] }>}
 */
export async function getOrganizationExceptions({ missingKeys, page = 1, perPage = 20, includeInactive = false }) {
  const keys = (missingKeys || []).filter(Boolean);
  if (keys.length === 0) {
    throw new Error('Select at least one missing-field criterion.');
  }
  const params = new URLSearchParams({
    missing: keys.join(','),
    page: String(page),
    per_page: String(perPage),
  });
  if (includeInactive) params.set('include_inactive', '1');

  const res = await fetch(`${API_BASE}/admin/reports/organization-exceptions?${params}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  const rows = (json.data || []).map(normalizeOrgExceptionRow);
  return {
    rows,
    pagination: json.pagination || {},
    missingApplied: json.missing_applied || keys,
  };
}
