/**
 * invoiceService.js
 *
 * API helpers for the Invoices resource.
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
 * Map an API invoice row to the shape expected by the UI.
 */
function normalizeInvoice(inv) {
  return {
    id:                 inv.id,
    invoiceNumber:      inv.invoice_number   || '',
    clientId:           inv.client_id        || null,
    clientName:         inv.client_name      || 'Unknown',
    invoiceDate:        inv.invoice_date     || '',
    dueDate:            inv.due_date         || '',
    totalAmount:        parseFloat(inv.total || inv.total_amount || 0),
    amountPaid:         parseFloat(inv.amount_paid || 0),
    status:             inv.status           || 'draft',
    billingProfileCode: inv.billing_profile_code || '',
    notes:              inv.notes            || '',
    createdAt:          inv.created_at       || '',
  };
}

/**
 * Fetch the list of invoices.
 * @returns {Promise<object[]>}
 */
export async function getInvoices({ page = 1, perPage = 100, search = '', status = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);

  const res = await fetch(`${API_BASE}/admin/invoices?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeInvoice);
}

/**
 * Create a new invoice.
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createInvoice(payload) {
  const body = {
    client_id:            payload.clientId            || null,
    invoice_date:         payload.invoiceDate         || new Date().toISOString().slice(0, 10),
    due_date:             payload.dueDate             || null,
    total:                parseFloat(payload.totalAmount || 0),
    amount_paid:          parseFloat(payload.amountPaid || 0),
    status:               payload.status              || 'draft',
    billing_profile_code: payload.billingProfileCode  || null,
    notes:                payload.notes               || null,
  };

  const res = await fetch(`${API_BASE}/admin/invoices`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeInvoice(data.data);
}

/**
 * Update an existing invoice.
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateInvoice(id, payload) {
  const body = {
    status:               payload.status              || null,
    amount_paid:          payload.amountPaid != null ? parseFloat(payload.amountPaid) : undefined,
    billing_profile_code: payload.billingProfileCode  || null,
    notes:                payload.notes               || null,
  };

  const res = await fetch(`${API_BASE}/admin/invoices/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeInvoice(data.data);
}
