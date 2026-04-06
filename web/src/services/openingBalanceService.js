/**
 * openingBalanceService.js
 *
 * API helpers for the Opening Balances resource.
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
 * Fetch all opening balances for a client.
 * @param {number|string} clientId
 * @returns {Promise<object[]>}
 */
export async function getOpeningBalances(clientId) {
  const params = new URLSearchParams({ client_id: clientId });
  const res = await fetch(`${API_BASE}/admin/opening-balances?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(row => ({
    clientId:           row.client_id,
    billingProfileCode: row.billing_profile_code,
    amount:             parseFloat(row.amount || 0),
    type:               row.type || 'debit',
  }));
}

/**
 * Save (upsert) an opening balance.
 * @param {{ clientId, billingProfileCode, amount, type }} payload
 * @returns {Promise<object>}
 */
export async function saveOpeningBalance(payload) {
  const body = {
    client_id:            payload.clientId,
    billing_profile_code: payload.billingProfileCode,
    amount:               parseFloat(payload.amount || 0),
    type:                 payload.type || 'debit',
  };

  const res = await fetch(`${API_BASE}/admin/opening-balances`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data;
}

/**
 * Delete an opening balance.
 * @param {number|string} clientId
 * @param {string} billingProfileCode
 */
export async function deleteOpeningBalance(clientId, billingProfileCode) {
  const params = new URLSearchParams({
    client_id:            clientId,
    billing_profile_code: billingProfileCode,
  });
  const res = await fetch(`${API_BASE}/admin/opening-balances?${params}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
