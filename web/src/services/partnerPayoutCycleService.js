/**
 * Partner payout cycles (same cadence as affiliate: 8 / 15 / 23 / month-end).
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

/** @param {number} year */
export async function listPartnerPayoutCycles(year) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-cycles?year=${encodeURIComponent(year)}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || [];
}

/** @param {string} periodEnd */
export async function ensurePartnerPayoutCycle(periodEnd) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-cycles/ensure`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ period_end: periodEnd }),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function getPartnerPayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-cycles/${cycleId}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function previewPartnerPayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-cycles/${cycleId}/preview`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function finalisePartnerPayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-cycles/${cycleId}/finalise`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseResponse(res);
}

/** @param {number|string} cycleId */
export async function disbursePartnerPayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-cycles/${cycleId}/disburse`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseResponse(res);
}

/**
 * @param {number|string} cycleId
 * @param {Array<{ partner_payout_accrual_id: number, amount_final: number, note?: string }>} adjustments
 * @param {string} requestReason
 */
export async function submitPartnerPayoutCycleAmendment(cycleId, adjustments, requestReason) {
  const res = await fetch(`${API_BASE}/admin/partner-payout-cycles/${cycleId}/amendments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      adjustments,
      request_reason: String(requestReason || '').trim(),
    }),
  });
  return parseResponse(res);
}

export async function listPendingPartnerPayoutCycleAmendments() {
  const res = await fetch(`${API_BASE}/admin/approvals/partner-payout-cycle-amendments`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || [];
}

export async function approvePartnerPayoutCycleAmendment(amendmentId) {
  const res = await fetch(
    `${API_BASE}/admin/approvals/partner-payout-cycle-amendments/${amendmentId}/approve`,
    { method: 'POST', headers: authHeaders(), body: '{}' },
  );
  return parseResponse(res);
}

export async function rejectPartnerPayoutCycleAmendment(amendmentId, reason) {
  const res = await fetch(
    `${API_BASE}/admin/approvals/partner-payout-cycle-amendments/${amendmentId}/reject`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify({ reason }) },
  );
  return parseResponse(res);
}
