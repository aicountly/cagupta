/**
 * kycDocumentService.js
 *
 * API helpers for the KYC Document module.
 * Handles multipart uploads, binary file serving, metadata CRUD, and OTP flows.
 */

import { API_BASE_URL } from '../constants/config';

const API_BASE = API_BASE_URL;

function authToken() {
  return localStorage.getItem('auth_token') || '';
}

function jsonHeaders() {
  const token = authToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function authOnlyHeaders(extra = {}) {
  const token = authToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function parseJson(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `Request failed (${res.status})`);
  }
  return json;
}

// ── List / Fetch ──────────────────────────────────────────────────────────────

/**
 * List all KYC documents for a specific entity.
 * Returns { documents, categories }.
 *
 * @param {'contact'|'organization'} entityType
 * @param {number} entityId
 */
export async function getKycDocuments(entityType, entityId) {
  const url = `${API_BASE}/api/admin/kyc-documents?entity_type=${encodeURIComponent(entityType)}&entity_id=${entityId}`;
  const res = await fetch(url, { headers: jsonHeaders() });
  const data = await parseJson(res);
  return data.data ?? { documents: [], categories: {} };
}

/**
 * Global paginated listing for the Documents management page.
 *
 * @param {{ page?: number, perPage?: number, search?: string, entityType?: string, category?: string }} opts
 */
export async function listAllKycDocuments({ page = 1, perPage = 50, search = '', entityType = '', category = '' } = {}) {
  const params = new URLSearchParams({
    page:        String(page),
    per_page:    String(perPage),
    ...(search     ? { search }                 : {}),
    ...(entityType ? { entity_type: entityType } : {}),
    ...(category   ? { category }               : {}),
  });
  const res  = await fetch(`${API_BASE}/api/admin/kyc-documents?${params}`, { headers: jsonHeaders() });
  const json = await parseJson(res);
  return { docs: json.data ?? [], pagination: json.meta?.pagination ?? null };
}

/**
 * Fetch metadata for a single document.
 *
 * @param {number} docId
 */
export async function getKycDocument(docId) {
  const res  = await fetch(`${API_BASE}/api/admin/kyc-documents/${docId}`, { headers: jsonHeaders() });
  const json = await parseJson(res);
  return json.data;
}

/**
 * Return the URL to view / download a document file inline.
 *
 * @param {number} docId
 * @param {boolean} forceDownload
 */
export function getDocumentFileUrl(docId, forceDownload = false) {
  const token = authToken();
  const dl    = forceDownload ? '&download=1' : '';
  return `${API_BASE}/api/admin/kyc-documents/${docId}/file?token=${encodeURIComponent(token)}${dl}`;
}

/**
 * Fetch and open the document file.
 * Uses fetch with Authorization header (more secure than embedding token in URL).
 * Returns an object URL that the caller must release with URL.revokeObjectURL().
 *
 * @param {number} docId
 * @param {boolean} forceDownload
 * @returns {Promise<string>} object URL
 */
export async function fetchDocumentBlob(docId, forceDownload = false) {
  const dl  = forceDownload ? '?download=1' : '';
  const res = await fetch(`${API_BASE}/api/admin/kyc-documents/${docId}/file${dl}`, {
    headers: authOnlyHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Fetch the audit trail for a document.
 *
 * @param {number} docId
 */
export async function getKycDocumentAudit(docId) {
  const res  = await fetch(`${API_BASE}/api/admin/kyc-documents/${docId}/audit`, { headers: jsonHeaders() });
  const json = await parseJson(res);
  return json.data ?? [];
}

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Upload one or more files.
 *
 * @param {{
 *   entityType: string,
 *   entityId: number,
 *   docCategory: string,
 *   docLabel?: string,
 *   notes?: string,
 *   skipCompression?: boolean,
 *   otpCode?: string,
 *   files: File[]
 * }} opts
 */
export async function uploadKycDocuments({
  entityType,
  entityId,
  docCategory,
  docLabel = '',
  notes = '',
  skipCompression = false,
  otpCode = '',
  files,
}) {
  const fd = new FormData();
  fd.append('entity_type',  entityType);
  fd.append('entity_id',    String(entityId));
  fd.append('doc_category', docCategory);
  fd.append('doc_label',    docLabel);
  fd.append('notes',        notes);
  if (skipCompression) {
    fd.append('skip_compression', '1');
  }
  for (const file of files) {
    fd.append('files[]', file);
  }

  const headers = authOnlyHeaders(otpCode ? { 'X-Superadmin-Otp': otpCode } : {});
  const res     = await fetch(`${API_BASE}/api/admin/kyc-documents`, {
    method:  'POST',
    headers,
    body:    fd,
  });
  const json = await parseJson(res);
  return json.data ?? [];
}

/**
 * Upload a new version of an existing document.
 *
 * @param {number} existingDocId
 * @param {{ notes?: string, skipCompression?: boolean, otpCode?: string, file: File }} opts
 */
export async function uploadNewVersion(existingDocId, { notes = '', skipCompression = false, otpCode = '', file }) {
  const fd = new FormData();
  fd.append('notes', notes);
  if (skipCompression) fd.append('skip_compression', '1');
  fd.append('files[]', file);

  const headers = authOnlyHeaders(otpCode ? { 'X-Superadmin-Otp': otpCode } : {});
  const res     = await fetch(`${API_BASE}/api/admin/kyc-documents/${existingDocId}/new-version`, {
    method:  'POST',
    headers,
    body:    fd,
  });
  const json = await parseJson(res);
  return json.data ?? [];
}

// ── Update / Delete ───────────────────────────────────────────────────────────

/**
 * Update the label and/or notes of a document.
 *
 * @param {number} docId
 * @param {{ docLabel?: string, notes?: string }} data
 */
export async function updateKycDocument(docId, { docLabel, notes }) {
  const body = {};
  if (docLabel !== undefined) body.doc_label = docLabel;
  if (notes    !== undefined) body.notes     = notes;

  const res  = await fetch(`${API_BASE}/api/admin/kyc-documents/${docId}`, {
    method:  'PUT',
    headers: jsonHeaders(),
    body:    JSON.stringify(body),
  });
  const json = await parseJson(res);
  return json.data;
}

/**
 * Soft-delete a document.  Pass otpCode for hard (permanent) delete.
 *
 * @param {number} docId
 * @param {string} [otpCode]
 */
export async function deleteKycDocument(docId, otpCode = '') {
  const headers = jsonHeaders();
  if (otpCode) headers['X-Superadmin-Otp'] = otpCode;

  const res = await fetch(`${API_BASE}/api/admin/kyc-documents/${docId}`, {
    method: 'DELETE',
    headers,
  });
  return parseJson(res);
}

// ── OTP helpers ───────────────────────────────────────────────────────────────

/**
 * Request OTP to upload a file without compression.
 *
 * @returns {Promise<{ otp_sent: boolean, masked_email: string }>}
 */
export async function requestUncompressedOtp() {
  const res  = await fetch(`${API_BASE}/api/admin/kyc-documents/request-uncompressed-otp`, {
    method:  'POST',
    headers: jsonHeaders(),
  });
  const json = await parseJson(res);
  return json.data;
}

/**
 * Request OTP to permanently (hard) delete a document.
 *
 * @returns {Promise<{ otp_sent: boolean, masked_email: string }>}
 */
export async function requestDocumentDeleteOtp() {
  const res  = await fetch(`${API_BASE}/api/admin/kyc-documents/request-delete-otp`, {
    method:  'POST',
    headers: jsonHeaders(),
  });
  const json = await parseJson(res);
  return json.data;
}
