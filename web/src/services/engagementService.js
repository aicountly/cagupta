/**
 * engagementService.js
 *
 * API helpers for the Services / Engagements resource (maps to the `services` table).
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

function positiveIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** API stores `tasks` as JSON text; coerce to an array for the UI. */
function parseTasks(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Map an API service row to the shape expected by the Services/Engagements UI.
 */
function normalizeEngagement(s) {
  return {
    id:                 s.id,
    clientType:         s.client_type         || 'contact',
    clientId:           s.client_id           || s.organization_id || null,
    clientName:         s.client_name         || s.organization_name || 'Unknown',
    referringAffiliateUserId: s.referring_affiliate_user_id ?? null,
    referralStartDate:  s.referral_start_date || '',
    commissionMode:     s.commission_mode     || 'referral_only',
    clientFacingRestricted: Boolean(s.client_facing_restricted),
    categoryId:         s.category_id         || '',
    categoryName:       s.category_name       || '',
    subcategoryId:      s.subcategory_id      || '',
    subcategoryName:    s.subcategory_name    || '',
    engagementTypeId:   s.engagement_type_id  || '',
    engagementTypeName: s.engagement_type_name || '',
    type:               s.service_type        || s.type || '',
    financialYear:      s.financial_year      || '',
    assignedTo:         s.assigned_to_name    || s.assigned_to || '',
    assignedToUserId:   positiveIntOrNull(s.assigned_to),
    dueDate:            s.due_date            || '',
    status:             s.status              || 'not_started',
    feeAgreed:          s.fees                != null ? Number(s.fees) : (s.fee_agreed != null ? Number(s.fee_agreed) : null),
    notes:              s.notes               || '',
    tasks:              parseTasks(s.tasks),
    createdAt:          s.created_at          || '',
  };
}

/**
 * Fetch the list of service engagements.
 * @returns {Promise<object[]>}
 */
export async function getEngagements({
  page = 1, perPage = 100, search = '', status = '', clientId = null, organizationId = null,
} = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);
  if (clientId != null && clientId !== '' && Number(clientId) > 0) {
    params.set('client_id', String(clientId));
  }
  if (organizationId != null && organizationId !== '' && Number(organizationId) > 0) {
    params.set('organization_id', String(organizationId));
  }

  const res = await fetch(`${API_BASE}/admin/services?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeEngagement);
}

/**
 * Fetch one service engagement by id.
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function getEngagement(id) {
  const res = await fetch(`${API_BASE}/admin/services/${id}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return normalizeEngagement(data.data);
}

/**
 * Create a new service engagement.
 * @param {object} payload
 * @returns {Promise<object>}
 */

export async function createEngagement(payload) {
  const body = {
    client_type:          payload.clientType         || 'contact',
    client_id:            payload.clientType === 'contact' ? (payload.clientId || null) : null,
    organization_id:      payload.clientType === 'organization' ? (payload.clientId || null) : null,
    client_name:          payload.clientName          || null,
    category_id:          payload.categoryId          || null,
    category_name:        payload.categoryName        || null,
    subcategory_id:       payload.subcategoryId       || null,
    subcategory_name:     payload.subcategoryName     || null,
    engagement_type_id:   payload.engagementTypeId    || null,
    engagement_type_name: payload.engagementTypeName  || null,
    service_type:         payload.type                || null,
    financial_year:       payload.financialYear       || null,
    assigned_to:          positiveIntOrNull(payload.assignedTo),
    due_date:             payload.dueDate             || null,
    status:               payload.status              || 'not_started',
    fees:                 payload.feeAgreed           || null,
    notes:                payload.notes               || null,
    tasks:                payload.tasks               || [],
  };
  const refAff = positiveIntOrNull(payload.referringAffiliateUserId);
  if (refAff) {
    body.referring_affiliate_user_id = refAff;
  }
  if (payload.referralStartDate) {
    body.referral_start_date = payload.referralStartDate;
  }
  if (payload.commissionMode) {
    body.commission_mode = payload.commissionMode;
  }
  if (payload.clientFacingRestricted) {
    body.client_facing_restricted = true;
  }

  const res = await fetch(`${API_BASE}/admin/services`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeEngagement(data.data);
}

/**
 * Update an existing service engagement.
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateEngagement(id, payload) {
  const body = {};
  if ('status' in payload) body.status = payload.status;
  if ('assignedTo' in payload) body.assigned_to = positiveIntOrNull(payload.assignedTo);
  if ('dueDate' in payload) body.due_date = payload.dueDate || null;
  if ('feeAgreed' in payload) {
    const v = payload.feeAgreed;
    body.fees = v === '' || v === null ? null : Number(v);
  }
  if ('notes' in payload) body.notes = payload.notes ?? null;
  if ('tasks' in payload) body.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  if ('type' in payload) body.service_type = payload.type || null;
  if ('financialYear' in payload) body.financial_year = payload.financialYear || null;
  if ('referringAffiliateUserId' in payload) {
    body.referring_affiliate_user_id = positiveIntOrNull(payload.referringAffiliateUserId);
  }
  if ('referralStartDate' in payload) body.referral_start_date = payload.referralStartDate || null;
  if ('commissionMode' in payload) body.commission_mode = payload.commissionMode || 'referral_only';
  if ('clientFacingRestricted' in payload) body.client_facing_restricted = Boolean(payload.clientFacingRestricted);

  const res = await fetch(`${API_BASE}/admin/services/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeEngagement(data.data);
}

/**
 * Add a task to an existing service engagement.
 * @param {number|string} engagementId
 * @param {object} taskData  { title, assignedTo?, dueDate?, priority? }
 * @returns {Promise<object>} Updated engagement after adding the task.
 */
/**
 * Delete a service engagement permanently.
 * @param {number|string} id
 */
export async function deleteEngagement(id) {
  const res = await fetch(`${API_BASE}/admin/services/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}

export async function createTask(engagementId, taskData) {
  const body = {
    title:      taskData.title      || '',
    assignedTo: taskData.assignedTo || null,
    dueDate:    taskData.dueDate    || null,
    priority:   taskData.priority   || 'medium',
  };

  const res = await fetch(`${API_BASE}/admin/services/${engagementId}/tasks`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeEngagement(data.data);
}

/** @param {object} r Raw API row from billing-report */
function normalizeBillingReportRow(r) {
  const flags = r.completion_flags || {};
  return {
    id: r.id,
    clientType: r.client_type || 'contact',
    clientId: r.client_id || null,
    organizationId: r.organization_id || null,
    clientName: r.client_name || 'Unknown',
    serviceType: r.service_type || '',
    status: r.status || '',
    billingClosure: r.billing_closure || null,
    billingBuiltAt: r.billing_built_at || null,
    billingBuiltAmount: r.billing_built_amount != null ? Number(r.billing_built_amount) : null,
    nonBillableAt: r.non_billable_at || null,
    nonBillableReason: r.non_billable_reason || '',
    invoiceCount: Number(r.invoice_count) || 0,
    amountBilled: Number(r.amount_billed) || 0,
    hasInvoice: Boolean(r.has_invoice),
    completionFlags: {
      engagementCompleted: Boolean(flags.engagement_completed),
      allTasksDone: Boolean(flags.all_tasks_done),
    },
  };
}

/**
 * Billing queue report (Invoices & Ledger → Service billing).
 * @returns {Promise<{ rows: object[], pagination: object }>}
 */
export async function getBillingReport({
  page = 1,
  perPage = 20,
  completion = 'any',
  closure = 'pending',
  search = '',
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    completion,
    closure,
  });
  if (search) params.set('search', search);

  const res = await fetch(`${API_BASE}/admin/services/billing-report?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  const rows = (data.data || []).map(normalizeBillingReportRow);
  return { rows, pagination: data.pagination || {} };
}

/**
 * Invoice txn rows linked to an engagement (history modal).
 * @returns {Promise<object[]>}
 */
export async function getServiceBillingInvoices(serviceId) {
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/billing-invoices`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map((t) => ({
    id: t.id,
    invoiceNumber: t.invoice_number || '',
    txnDate: t.txn_date || '',
    subtotal: Number(t.subtotal) || Number(t.amount) || 0,
    amount: Number(t.amount) || 0,
    narration: t.narration || '',
    invoiceStatus: t.invoice_status || '',
  }));
}

/**
 * Mark billing closure: built | non_billable
 */
export async function patchBillingClosure(serviceId, { closure, reason }) {
  const body = { closure };
  if (reason != null && String(reason).trim() !== '') body.reason = String(reason).trim();
  const res = await fetch(`${API_BASE}/admin/services/${serviceId}/billing-closure`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseResponse(res);
}
