/**
 * Quotation defaults (OTP-gated) and per-lead quotations.
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

export async function getQuotationDefaults() {
  const res = await fetch(`${API_BASE}/admin/quotation-defaults`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function getQuotationDefaultByEngagementType(engagementTypeId) {
  const res = await fetch(
    `${API_BASE}/admin/quotation-defaults/by-engagement-type/${engagementTypeId}`,
    { headers: authHeaders() },
  );
  const data = await parseResponse(res);
  return data.data;
}

export async function getQuotationPendingSummary() {
  const res = await fetch(`${API_BASE}/admin/quotation-defaults/pending-summary`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function requestQuotationSetupOtp({ passphrase, otpRecipient = 'super_admin' }) {
  const res = await fetch(`${API_BASE}/admin/quotation-defaults/request-change-otp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ passphrase, otp_recipient: otpRecipient }),
  });
  return parseResponse(res);
}

export async function saveQuotationDefault(engagementTypeId, { otp, otpRecipient, defaultPrice, documentsRequired }) {
  const body = {
    otp,
    otp_recipient: otpRecipient || 'super_admin',
    documents_required: Array.isArray(documentsRequired) ? documentsRequired : [],
  };
  if (defaultPrice !== '' && defaultPrice != null && !Number.isNaN(Number(defaultPrice))) {
    body.default_price = Number(defaultPrice);
  } else {
    body.default_price = null;
  }
  const res = await fetch(`${API_BASE}/admin/quotation-defaults/by-engagement-type/${engagementTypeId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function getLeadQuotations(leadId) {
  const res = await fetch(`${API_BASE}/admin/leads/${leadId}/quotations`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function createLeadQuotation(leadId, payload) {
  const res = await fetch(`${API_BASE}/admin/leads/${leadId}/quotations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function updateLeadQuotation(leadId, quotationId, payload) {
  const res = await fetch(`${API_BASE}/admin/leads/${leadId}/quotations/${quotationId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}
