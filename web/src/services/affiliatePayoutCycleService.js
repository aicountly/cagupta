/**
 * Affiliate payout cycles (8 / 15 / 23 / month-end) — Accounts finalisation & disbursement.
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
export async function listAffiliatePayoutCycles(year) {
  const res = await fetch(`${API_BASE}/admin/affiliate-payout-cycles?year=${encodeURIComponent(year)}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || [];
}

/** @param {string} periodEnd YYYY-MM-DD (cycle end date: 8, 15, 23, or month-end) */
export async function ensureAffiliatePayoutCycle(periodEnd) {
  const res = await fetch(`${API_BASE}/admin/affiliate-payout-cycles/ensure`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ period_end: periodEnd }),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function getAffiliatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/affiliate-payout-cycles/${cycleId}`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function previewAffiliatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/affiliate-payout-cycles/${cycleId}/preview`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data;
}

/** @param {number|string} cycleId */
export async function finaliseAffiliatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/affiliate-payout-cycles/${cycleId}/finalise`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseResponse(res);
}

/** @param {number|string} cycleId */
export async function disburseAffiliatePayoutCycle(cycleId) {
  const res = await fetch(`${API_BASE}/admin/affiliate-payout-cycles/${cycleId}/disburse`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseResponse(res);
}

/**
 * @param {number|string} cycleId
 * @param {Array<{ commission_accrual_id: number, amount_final: number, note?: string }>} adjustments
 */
export async function submitAffiliatePayoutCycleAmendment(cycleId, adjustments) {
  const res = await fetch(`${API_BASE}/admin/affiliate-payout-cycles/${cycleId}/amendments`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adjustments }),
  });
  return parseResponse(res);
}

export async function listPendingAffiliatePayoutCycleAmendments() {
  const res = await fetch(`${API_BASE}/admin/approvals/affiliate-payout-cycle-amendments`, {
    headers: authHeaders(),
  });
  const json = await parseResponse(res);
  return json.data || [];
}

export async function approveAffiliatePayoutCycleAmendment(amendmentId) {
  const res = await fetch(
    `${API_BASE}/admin/approvals/affiliate-payout-cycle-amendments/${amendmentId}/approve`,
    { method: 'POST', headers: authHeaders(), body: '{}' },
  );
  return parseResponse(res);
}

export async function rejectAffiliatePayoutCycleAmendment(amendmentId, reason) {
  const res = await fetch(
    `${API_BASE}/admin/approvals/affiliate-payout-cycle-amendments/${amendmentId}/reject`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify({ reason }) },
  );
  return parseResponse(res);
}
