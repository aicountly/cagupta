/**
 * txnService.js
 *
 * API helpers for the unified Transactions (txn) resource.
 */

import { API_BASE_URL } from '../../../constants/config';

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
    err.apiData = json.data;
    throw err;
  }
  return json;
}

/** Must match LedgerDimensions ledger_class strings. */
const LEDGER_CLASSES = ['regular', 'memorandum', 'optional'];

export function normalizeLedgerClassForApi(lc) {
  const s = String(lc || '').trim();
  return LEDGER_CLASSES.includes(s) ? s : 'regular';
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

function normalizeReceiptAllocations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    targetType: String(a.target_type || ''),
    targetTxnId: a.target_txn_id != null ? String(a.target_txn_id) : '',
    amount: String(a.amount != null ? a.amount : ''),
  }));
}

function normalizeSettlementLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => ({
    targetType: String(l.target_type || ''),
    targetTxnId: l.target_txn_id != null ? String(l.target_txn_id) : '',
    amount: String(l.amount != null ? l.amount : ''),
  }));
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
    createdBy:          t.created_by != null ? parseInt(t.created_by, 10) || null : null,
    createdByName:      t.created_by_user_name || '',
    updatedBy:          t.updated_by != null ? parseInt(t.updated_by, 10) || null : null,
    updatedByName:      t.updated_by_user_name || '',
    updatedAt:          t.updated_at       || '',
    lineItems:          normalizeLineItems(t.line_items),
    gstBreakdown:       normalizeGstBreakdown(t.gst_breakdown),
    firmBankAccountId:  t.firm_bank_account_id != null ? parseInt(t.firm_bank_account_id, 10) || null : null,
    counterpartyFirmBankAccountId: t.counterparty_firm_bank_account_id != null
      ? parseInt(t.counterparty_firm_bank_account_id, 10) || null : null,
    firmExpenseCategory: t.firm_expense_category || '',
    movement:           t.movement != null ? parseFloat(t.movement) : null,
    rowType:            t.row_type || '',
    ledgerClass:        t.ledger_class || 'regular',
    ledgerMovementKind: t.ledger_movement_kind || null,
    publicRef:          t.public_ref || '',
    sourceTxnId:        t.source_txn_id != null ? parseInt(t.source_txn_id, 10) || null : null,
    ledgerSlice:        t.ledger_slice || null,
    allocations:        normalizeReceiptAllocations(t.allocations),
    settlementLines:    normalizeSettlementLines(t.settlement_lines),
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
  if (params.ledgerClass != null && String(params.ledgerClass).trim() !== '') {
    query.set('ledger_class', normalizeLedgerClassForApi(params.ledgerClass));
  }
  if (params.omitCancelledReversed) {
    query.set('omit_cancelled_reversed', '1');
  }

  const res  = await fetch(`${API_BASE}/admin/txn?${query}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return {
    txns:       (data.data || []).map(normalizeTxn),
    pagination: data.meta?.pagination || {},
  };
}

/** GET /api/admin/invoices/cost-variance-report */
export async function getInvoiceCostVarianceReport({ dateFrom, dateTo }) {
  const q = new URLSearchParams();
  q.set('date_from', dateFrom);
  q.set('date_to', dateTo);
  const res = await fetch(`${API_BASE}/admin/invoices/cost-variance-report?${q}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return Array.isArray(data.data) ? data.data : [];
}

/** POST /api/admin/invoices/cost-analysis-preview */
export async function postInvoiceCostAnalysisPreview(payload) {
  const res = await fetch(`${API_BASE}/admin/invoices/cost-analysis-preview`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data || {};
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

/** GET /api/admin/txn/:id/audit-log */
export async function fetchTxnAuditLog(txnId, params = {}) {
  const query = new URLSearchParams();
  if (params.limit)  query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  const res  = await fetch(
    `${API_BASE}/admin/txn/${txnId}/audit-log${qs ? `?${qs}` : ''}`,
    { headers: authHeaders() },
  );
  const data = await parseResponse(res);
  return data.data || { summary: {}, entries: [] };
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

/** DELETE /api/admin/txn/:id — protected ledger rows require superadminOtp header */
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

/** POST /api/admin/txn/request-ledger-delete-otp — one OTP for a batch (single or bulk) */
export async function requestLedgerDeleteOtp(ids) {
  const idArr = Array.isArray(ids) ? ids.map((x) => parseInt(x, 10)).filter((n) => n > 0) : [];
  const res = await fetch(`${API_BASE}/admin/txn/request-ledger-delete-otp`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ ids: idArr }),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/** POST /api/admin/txn/bulk-delete — header X-Superadmin-Otp; same OTP covers all ids */
export async function bulkDeleteTxns(ids, { superadminOtp } = {}) {
  const idArr = Array.isArray(ids) ? ids.map((x) => parseInt(x, 10)).filter((n) => n > 0) : [];
  const headers = { ...authHeaders() };
  if (superadminOtp) {
    headers['X-Superadmin-Otp'] = String(superadminOtp).trim();
  }
  const res = await fetch(`${API_BASE}/admin/txn/bulk-delete`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ ids: idArr }),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/** POST /api/admin/txn/:id/request-ledger-reversal-otp — OTP to acting user’s email (feature-gated server-side) */
export async function requestLedgerReversalUserOtp(txnId) {
  const res = await fetch(`${API_BASE}/admin/txn/${txnId}/request-ledger-reversal-otp`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({}),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/**
 * POST /api/admin/txn/:id/reverse — compensating txn; use superadminOtp and/or user otp in body.
 * @param {number|string} txnId
 * @param {{ reason: string, otp?: string, superadminOtp?: string }} opts
 */
export async function reverseLedgerTxn(txnId, { reason, otp, superadminOtp } = {}) {
  const headers = { ...authHeaders() };
  if (superadminOtp) {
    headers['X-Superadmin-Otp'] = String(superadminOtp).trim();
  }
  const body = { reason: String(reason || '').trim() };
  if (otp && !superadminOtp) {
    body.otp = String(otp).trim();
  }
  const res  = await fetch(`${API_BASE}/admin/txn/${txnId}/reverse`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/** POST /api/admin/txn/:id/cancel-reversal — undo compensating reversal (`txnId` is the original posting). */
export async function cancelLedgerReversalTxn(txnId, { otp, superadminOtp } = {}) {
  const headers = { ...authHeaders() };
  if (superadminOtp) {
    headers['X-Superadmin-Otp'] = String(superadminOtp).trim();
  }
  const body = {};
  if (otp && !superadminOtp) {
    body.otp = String(otp).trim();
  }
  const res = await fetch(`${API_BASE}/admin/txn/${txnId}/cancel-reversal`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return data.data || {};
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
    if (clientIdOrObj.ledgerClass)    params.set('ledger_class', clientIdOrObj.ledgerClass);
    if (clientIdOrObj.ledgerView)     params.set('ledger_view', clientIdOrObj.ledgerView);
    if (clientIdOrObj.limit)          params.set('limit', String(clientIdOrObj.limit));
  } else if (clientIdOrObj) {
    // backward-compatible: plain number/string treated as clientId
    params.set('client_id', clientIdOrObj);
  }
  const res  = await fetch(`${API_BASE}/admin/txn/ledger?${params}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeTxn);
}

/** GET /api/admin/txn/ledger-reconciliation — txn counts vs presented ledger rows per view */
export async function getLedgerReconciliation({
  clientId,
  organizationId,
  ledgerClass = 'regular',
} = {}) {
  const params = new URLSearchParams();
  if (clientId) params.set('client_id', String(clientId));
  if (organizationId) params.set('organization_id', String(organizationId));
  params.set('ledger_class', normalizeLedgerClassForApi(ledgerClass));
  const res = await fetch(`${API_BASE}/admin/txn/ledger-reconciliation?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || {};
}

/** GET /api/admin/txn/bill-settlement-report */
export async function getBillSettlementReport({
  clientId,
  organizationId,
  ledgerClass = 'regular',
  ledgerView = 'consolidated',
  dateFrom,
  dateTo,
} = {}) {
  const query = new URLSearchParams();
  if (clientId) query.set('client_id', clientId);
  if (organizationId) query.set('organization_id', organizationId);
  query.set('ledger_class', ledgerClass);
  query.set('ledger_view', ledgerView);
  if (dateFrom) query.set('date_from', dateFrom);
  if (dateTo) query.set('date_to', dateTo);
  const res = await fetch(`${API_BASE}/admin/txn/bill-settlement-report?${query}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || {};
}

/** GET /api/admin/txn/recovery-by-group — receivables by client group (fees / taxes / reimbursement per ledger class) */
export async function getRecoveryByGroup({ bucket = 'active' } = {}) {
  const query = new URLSearchParams();
  if (bucket) query.set('bucket', bucket);
  const qs = query.toString();
  const res = await fetch(`${API_BASE}/admin/txn/recovery-by-group${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  if (!data.data) {
    throw new Error(data.message || 'No data returned from server');
  }
  return data.data;
}

/** GET /api/admin/txn/receipts-with-unallocated — receipts with unallocated_advance > 0 */
export async function getReceiptsWithUnallocated({
  clientId,
  organizationId,
  ledgerClass = 'regular',
  ledgerMovementKind = 'fees',
}) {
  const query = new URLSearchParams();
  if (clientId) query.set('client_id', String(clientId));
  if (organizationId) query.set('organization_id', String(organizationId));
  query.set('ledger_class', normalizeLedgerClassForApi(ledgerClass));
  query.set('ledger_movement_kind', ledgerMovementKind === 'reimbursement' ? 'reimbursement' : 'fees');
  const res = await fetch(`${API_BASE}/admin/txn/receipts-with-unallocated?${query}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return Array.isArray(data.data) ? data.data : [];
}

/** POST /api/admin/txn with txn_type payment_expense
 *  Required: settlement_lines[] each { target_type: 'receipt'|'unallocated_advance', target_txn_id?, amount }; must sum to amount.
 */
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

/** GET /api/admin/txn/opening-balance — pass exactly one of clientId or organizationId */
export async function getOpeningBalance({ clientId, organizationId } = {}) {
  const params = new URLSearchParams();
  const oid = organizationId != null && String(organizationId) !== '' ? String(organizationId) : '';
  const cid = clientId != null && String(clientId) !== '' ? String(clientId) : '';
  if (oid) {
    params.set('organization_id', oid);
  } else if (cid) {
    params.set('client_id', cid);
  } else {
    throw new Error('getOpeningBalance: provide clientId or organizationId');
  }
  const res    = await fetch(`${API_BASE}/admin/txn/opening-balance?${params}`, { headers: authHeaders() });
  const data   = await parseResponse(res);
  return (data.data || []).map(row => ({
    clientId:            row.client_id ?? null,
    organizationId:      row.organization_id ?? null,
    billingProfileCode:  row.billing_profile_code,
    amount:              parseFloat(row.amount || 0),
    type:                row.debit > 0 ? 'debit' : 'credit',
    ledgerClass:         normalizeLedgerClassForApi(row.ledger_class),
    ledgerMovementKind:  row.ledger_movement_kind || null,
    txnDate:             row.txn_date ? String(row.txn_date).slice(0, 10) : '',
  }));
}

/** POST /api/admin/txn/opening-balance — body: client_id or organization_id, billing_profile_code, amount, type, ledger_class, ledger_movement_kind, txn_date */
export async function setOpeningBalance(payload) {
  const res  = await fetch(`${API_BASE}/admin/txn/opening-balance`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(payload),
  });
  const data = await parseResponse(res);
  return data.data;
}

/** GET /api/admin/txn/bank-ledger */
export async function getBankLedger({ firmBankAccountId, dateFrom = '', dateTo = '' }) {
  const q = new URLSearchParams({ firm_bank_account_id: String(firmBankAccountId) });
  if (dateFrom) q.set('date_from', dateFrom);
  if (dateTo) q.set('date_to', dateTo);
  const res = await fetch(`${API_BASE}/admin/txn/bank-ledger?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return data.data || [];
}

/** GET /api/admin/txn/firm-internal */
export async function getFirmInternalTxns({ kind = 'all', page = 1, perPage = 50, dateFrom = '', dateTo = '' } = {}) {
  const q = new URLSearchParams({ kind, page: String(page), per_page: String(perPage) });
  if (dateFrom) q.set('date_from', dateFrom);
  if (dateTo) q.set('date_to', dateTo);
  const res = await fetch(`${API_BASE}/admin/txn/firm-internal?${q}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return {
    rows: (data.data || []).map(normalizeTxn),
    pagination: data.meta?.pagination || {},
  };
}

export async function createFirmBankTransfer(payload) {
  const res = await fetch(`${API_BASE}/admin/txn`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      txn_type: 'firm_bank_transfer',
      from_firm_bank_account_id: payload.fromFirmBankAccountId,
      to_firm_bank_account_id: payload.toFirmBankAccountId,
      amount: payload.amount,
      txn_date: payload.txnDate,
      narration: payload.narration || '',
      ...(payload.transferScope ? { transfer_scope: payload.transferScope } : {}),
    }),
  });
  const data = await parseResponse(res);
  return data.data;
}

export async function createFirmExpenseTxn(payload) {
  const res = await fetch(`${API_BASE}/admin/txn`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      txn_type: 'firm_expense',
      firm_bank_account_id: payload.firmBankAccountId,
      firm_expense_category: payload.category,
      amount: payload.amount,
      txn_date: payload.txnDate,
      narration: payload.narration || '',
      notes: payload.notes || null,
    }),
  });
  const data = await parseResponse(res);
  return normalizeTxn(data.data);
}
