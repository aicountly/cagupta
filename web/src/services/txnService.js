/**
 * txnService.js
 *
 * API helpers for the unified Transactions (txn) resource.
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

function normalizeLineItems(raw) {
  let arr = raw;
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    const o = {
      description: String(row?.description ?? '').trim(),
      amount:      parseFloat(row?.amount ?? 0) || 0,
    };
    const lk = row?.line_kind ?? row?.lineKind;
    o.lineKind = lk === 'cost_recovery' ? 'cost_recovery' : 'professional_fee';
    if (o.lineKind === 'professional_fee') {
      o.manpowerIncluded = Boolean(row?.manpower_included ?? row?.manpowerIncluded);
      o.manpowerCostAmount = parseFloat(row?.manpower_cost_amount ?? row?.manpowerCostAmount ?? 0) || 0;
    }
    if (row?.engagement_type_id != null) o.engagementTypeId = parseInt(row.engagement_type_id, 10) || null;
    if (row?.service_line_key) o.serviceLineKey = String(row.service_line_key);
    return o;
  }).filter((row) => row.description && row.amount > 0);
}

function normalizeGstBreakdown(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return typeof p === 'object' && p !== null ? p : null;
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? raw : null;
}

/**
 * Normalize a raw txn row from the backend.
 */
function normalizeTxn(t) {
  return {
    id:                 t.id,
    clientId:           t.client_id        || null,
    clientName:         t.client_name      || 'Unknown',
    organizationId:     t.organization_id  || null,
    // Ledger SQL uses AS date / AS entry_type; other payloads may use snake_case or camelCase
    txnType:            t.txn_type         || t.entry_type     || t.txnType     || '',
    txnDate:            t.txn_date         || t.date           || t.txnDate     || '',
    narration:          t.narration        || '',
    debit:              parseFloat(t.debit  || 0),
    credit:             parseFloat(t.credit || 0),
    amount:             parseFloat(t.amount || 0),
    balance:            parseFloat(t.balance || 0),
    billingProfileCode: t.billing_profile_code || '',
    invoiceNumber:      t.invoice_number   || '',
    invoiceStatus:      t.invoice_status   || '',
    dueDate:            t.due_date         || '',
    subtotal:           parseFloat(t.subtotal    || 0),
    taxPercent:         parseFloat(t.tax_percent || 0),
    taxAmount:          parseFloat(t.tax_amount  || 0),
    paymentMethod:      t.payment_method   || '',
    referenceNumber:    t.reference_number || '',
    expensePurpose:     t.expense_purpose  || '',
    paidFrom:           t.paid_from        || '',
    tdsStatus:          t.tds_status       || '',
    tdsSection:         t.tds_section      || '',
    tdsRate:            parseFloat(t.tds_rate || 0),
    linkedTxnId:        t.linked_txn_id    || null,
    serviceId:          t.service_id       != null ? parseInt(t.service_id, 10) || null : null,
    notes:              t.notes            || '',
    status:             t.status           || 'active',
    createdAt:          t.created_at       || '',
    lineItems:          normalizeLineItems(t.line_items),
    gstBreakdown:       normalizeGstBreakdown(t.gst_breakdown),
  };
}

/** GET /api/admin/txn */
export async function getTxns(params = {}) {
  const query = new URLSearchParams();
  if (params.page)      query.set('page', params.page);
  if (params.perPage)   query.set('per_page', params.perPage);
  if (params.search)    query.set('search', params.search);
  if (params.txnType)   query.set('txn_type', params.txnType);
  if (params.clientId)  query.set('client_id', params.clientId);
  if (params.organizationId) query.set('organization_id', params.organizationId);
  if (params.expensePurpose) query.set('expense_purpose', params.expensePurpose);
  if (params.paymentMethod) query.set('payment_method', params.paymentMethod);
  if (params.paidFrom) query.set('paid_from', params.paidFrom);
  if (params.tdsStatus) query.set('tds_status', params.tdsStatus);
  if (params.status)    query.set('status', params.status);
  if (params.dateFrom)  query.set('date_from', params.dateFrom);
  if (params.dateTo)    query.set('date_to', params.dateTo);

  const res  = await fetch(`${API_BASE}/admin/txn?${query}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return {
    txns:       (data.data || []).map(normalizeTxn),
    pagination: data.meta?.pagination || {},
  };
}

/** POST /api/admin/txn */
export async function createTxn(payload) {
  const res  = await fetch(`${API_BASE}/admin/txn`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** GET /api/admin/txn/:id */
export async function getTxn(id) {
  const res  = await fetch(`${API_BASE}/admin/txn/${id}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** PUT /api/admin/txn/:id — pass superadminOtp for ledger invoice rows */
export async function updateTxn(id, payload, { superadminOtp } = {}) {
  const headers = { ...authHeaders() };
  if (superadminOtp) {
    headers['X-Superadmin-Otp'] = String(superadminOtp).trim();
  }
  const res  = await fetch(`${API_BASE}/admin/txn/${id}`, {
    method:  'PUT',
    headers,
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** DELETE /api/admin/txn/:id — invoice rows require superadminOtp header */
export async function deleteTxn(id, { superadminOtp } = {}) {
  const headers = { ...authHeaders() };
  if (superadminOtp) {
    headers['X-Superadmin-Otp'] = String(superadminOtp).trim();
  }
  const res = await fetch(`${API_BASE}/admin/txn/${id}`, {
    method:  'DELETE',
    headers,
  });
  await parseResponse(res);
}

/** POST — superadmin receives OTP email; intent is update | delete */
export async function requestInvoiceModifyOtp(id, { intent = 'update' } = {}) {
  const res = await fetch(
    `${API_BASE}/admin/txn/${id}/request-invoice-modify-otp?intent=${encodeURIComponent(intent)}`,
    {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ intent }),
    }
  );
  const data = await parseResponse(res);
  return data.data || {};
}

/** GET /api/admin/txn/ledger?client_id=... or ?organization_id=... */
export async function getLedger(clientIdOrObj) {
  const params = new URLSearchParams();
  if (clientIdOrObj && typeof clientIdOrObj === 'object') {
    if (clientIdOrObj.clientId)       params.set('client_id', clientIdOrObj.clientId);
    if (clientIdOrObj.organizationId) params.set('organization_id', clientIdOrObj.organizationId);
  } else if (clientIdOrObj) {
    // backward-compatible: plain number/string treated as clientId
    params.set('client_id', clientIdOrObj);
  }
  const res  = await fetch(`${API_BASE}/admin/txn/ledger?${params}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeTxn);
}

/** POST /api/admin/txn with txn_type payment_expense */
export async function createPaymentExpense(payload) {
  const body = { txn_type: 'payment_expense', ...payload };
  return createTxn(body);
}

/** POST /api/admin/txn/receipt */
export async function createReceipt(payload) {
  const res  = await fetch(`${API_BASE}/admin/txn/receipt`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** POST /api/admin/txn/tds */
export async function createTds(payload) {
  const res  = await fetch(`${API_BASE}/admin/txn/tds`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** PATCH /api/admin/txn/tds/:id/finalize */
export async function finalizeTds(id) {
  const res  = await fetch(`${API_BASE}/admin/txn/tds/${id}/finalize`, {
    method:  'PATCH',
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** GET /api/admin/txn/tds */
export async function getTdsEntries(params = {}) {
  const query = new URLSearchParams();
  if (params.clientId)  query.set('client_id', params.clientId);
  if (params.tdsStatus) query.set('tds_status', params.tdsStatus);

  const res  = await fetch(`${API_BASE}/admin/txn/tds?${query}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeTxn);
}

/** POST /api/admin/txn/rebate */
export async function createRebate(payload) {
  const res  = await fetch(`${API_BASE}/admin/txn/rebate`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** POST /api/admin/txn/credit-note */
export async function createCreditNote(payload) {
  const res  = await fetch(`${API_BASE}/admin/txn/credit-note`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}

/** GET /api/admin/txn/opening-balance?client_id=... */
export async function getOpeningBalance(clientId) {
  const params = new URLSearchParams({ client_id: clientId });
  const res    = await fetch(`${API_BASE}/admin/txn/opening-balance?${params}`, { headers: authHeaders() });
  const data   = await parseResponse(res);
  return (data.data || []).map(row => ({
    clientId:           row.client_id,
    billingProfileCode: row.billing_profile_code,
    amount:             parseFloat(row.amount || 0),
    type:               row.debit > 0 ? 'debit' : 'credit',
  }));
}

/** POST /api/admin/txn/opening-balance */
export async function setOpeningBalance(payload) {
  const res  = await fetch(`${API_BASE}/admin/txn/opening-balance`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}
