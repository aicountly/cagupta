/**
 * Associate payout cycles (8 / 15 / 23 / month-end) — Accounts finalisation & disbursement.
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
export async function listAssociatePayoutCycles(year) {
  const res = await fetch(`${API_BASE}/admin/associate-payout-cycles?year=${encodeURIComponent(year)}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || [];
}

/** @param {string} periodEnd YYYY-MM-DD (cycle end date: 8, 15, 23, or month-end) */
export async function ensureAssociatePayoutCycle(periodEnd) {
  const res = await fetch(`${API_BASE}/admin/associate-payout-cycles/ensure`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ period_end: periodEnd }),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function getAssociatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/associate-payout-cycles/${cycleId}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function previewAssociatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/associate-payout-cycles/${cycleId}/preview`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function finaliseAssociatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/associate-payout-cycles/${cycleId}/finalise`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseResponse(res);
}

/** @param {number|string} cycleId */
export async function disburseAssociatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/associate-payout-cycles/${cycleId}/disburse`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseResponse(res);
}

/**
 * @param {number|string} cycleId
 * @param {Array<{ commission_accrual_id: number, amount_final: number, note?: string }>} adjustments
 * @param {string} requestReason
 */
export async function submitAssociatePayoutCycleAmendment(cycleId, adjustments, requestReason) {
  const res = await fetch(`${API_BASE}/admin/associate-payout-cycles/${cycleId}/amendments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      adjustments,
      request_reason: String(requestReason || '').trim(),
    }),
  });
  return parseResponse(res);
}

export async function listPendingAssociatePayoutCycleAmendments() {
  const res = await fetch(`${API_BASE}/admin/approvals/associate-payout-cycle-amendments`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || [];
}

export async function approveAssociatePayoutCycleAmendment(amendmentId) {
  const res = await fetch(
    `${API_BASE}/admin/approvals/associate-payout-cycle-amendments/${amendmentId}/approve`,
    { method: 'POST', headers: authHeaders(), body: '{}' },
  );
  return parseResponse(res);
}

export async function rejectAssociatePayoutCycleAmendment(amendmentId, reason) {
  const res = await fetch(
    `${API_BASE}/admin/approvals/associate-payout-cycle-amendments/${amendmentId}/reject`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify({ reason }) },
  );
  return parseResponse(res);
}
