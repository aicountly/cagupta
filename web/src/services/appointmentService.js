/**
 * appointmentService.js
 *
 * API helpers for the Appointments (calendar_events) resource.
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
 * Map an API appointment row to the shape expected by the UI.
 */
function normalizeAppointment(a) {
  return {
    id:                   a.id,
    clientName:           a.client_name || a.title || 'Unknown',
    staffName:            a.staff_name || a.assigned_to_name || '',
    date:                 a.event_date || a.date || '',
    startTime:            a.start_time || '',
    endTime:              a.end_time || '',
    mode:                 a.event_type || a.mode || 'in_person',
    subject:              a.description || a.subject || a.title || '',
    status:               a.status || 'scheduled',
    clientId:             a.client_id ?? null,
    billingOrganizationId: a.billing_organization_id ?? null,
    createdAt:            a.created_at || '',
    appointmentStatus:   a.appointment_status || 'confirmed',
    paymentTerms:        a.payment_terms || null,
    feeSubtotal:         a.fee_subtotal != null ? Number(a.fee_subtotal) : null,
    amountDueNow:        a.amount_due_now != null ? Number(a.amount_due_now) : null,
    amountCollected:     a.amount_collected != null ? Number(a.amount_collected) : null,
    invoiceTxnId:        a.invoice_txn_id ?? null,
    zoomJoinUrl:         a.zoom_join_url || null,
    feeRuleId:           a.fee_rule_id ?? null,
    billingProfileCode:  a.billing_profile_code || null,
    paymentTerms:        a.payment_terms || null,
    advanceAmount:       a.advance_amount != null ? Number(a.advance_amount) : null,
    advancePercent:      a.advance_percent != null ? Number(a.advance_percent) : null,
    billingProfileSnapshot: a.billing_profile_snapshot || null,
    billableHours:       a.billable_hours != null ? Number(a.billable_hours) : null,
  };
}

/**
 * Fetch the list of appointments.
 * @returns {Promise<object[]>}
 */
/** @returns {Promise<object>} normalized appointment */
export async function getAppointment(id) {
  const res = await fetch(`${API_BASE}/admin/appointments/${id}`, { headers: authHeaders() });
  const data = await parseResponse(res);
  return normalizeAppointment(data.data);
}

export async function getAppointments({ page = 1, perPage = 100, search = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (search) params.set('search', search);

  const res = await fetch(`${API_BASE}/admin/appointments?${params}`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return (data.data || []).map(normalizeAppointment);
}

/**
 * Create a new appointment.
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createAppointment(payload) {
  const body = {
    title:       payload.subject || payload.title || '',
    description: payload.subject || '',
    event_date:  payload.date || '',
    start_time:  payload.startTime || null,
    end_time:    payload.endTime || null,
    event_type:  payload.mode || 'in_person',
    client_name: payload.clientName || null,
    staff_name:  payload.staffName || null,
    status:      payload.status || 'scheduled',
  };
  if (payload.clientId != null && payload.clientId !== '') {
    body.client_id = parseInt(payload.clientId, 10);
  }
  if (payload.billingOrganizationId != null && payload.billingOrganizationId !== '') {
    body.billing_organization_id = parseInt(payload.billingOrganizationId, 10);
  }
  if (payload.feeRuleId != null && payload.feeRuleId !== '') {
    body.fee_rule_id = parseInt(payload.feeRuleId, 10);
    body.payment_terms = payload.paymentTerms || 'pay_later';
    body.billing_profile_code = payload.billingProfileCode || null;
    body.billing_profile_snapshot = payload.billingProfileSnapshot || null;
    if (payload.billableHours != null && payload.billableHours !== '') {
      body.billable_hours = parseFloat(payload.billableHours, 10);
    }
    if (payload.advanceAmount != null && payload.advanceAmount !== '') {
      body.advance_amount = parseFloat(payload.advanceAmount, 10);
    }
    if (payload.advancePercent != null && payload.advancePercent !== '') {
      body.advance_percent = parseFloat(payload.advancePercent, 10);
    }
    if (payload.invoiceLineDescription) {
      body.invoice_line_description = payload.invoiceLineDescription;
    }
    if (payload.invoiceLineKind) {
      body.invoice_line_kind = payload.invoiceLineKind;
    }
  }

  const res = await fetch(`${API_BASE}/admin/appointments`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeAppointment(data.data);
}

/**
 * @param {number|string} id
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateAppointment(id, payload) {
  const body = {};
  if (payload.subject != null || payload.title != null) {
    body.title = payload.subject || payload.title;
    body.description = payload.subject || payload.title;
  }
  if (payload.date != null) body.event_date = payload.date;
  if (payload.startTime != null) body.start_time = payload.startTime;
  if (payload.endTime != null) body.end_time = payload.endTime;
  if (payload.mode != null) body.event_type = payload.mode;
  if (payload.clientName != null) body.client_name = payload.clientName;
  if (payload.staffName != null) body.staff_name = payload.staffName;
  if (payload.status != null) body.status = payload.status;
  if (payload.clientId != null) body.client_id = payload.clientId ? parseInt(payload.clientId, 10) : null;
  if (payload.billingOrganizationId != null) {
    body.billing_organization_id = payload.billingOrganizationId
      ? parseInt(payload.billingOrganizationId, 10)
      : null;
  }

  const res = await fetch(`${API_BASE}/admin/appointments/${id}`, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await parseResponse(res);
  return normalizeAppointment(data.data);
}

/**
 * @param {number|string} id
 */
export async function deleteAppointment(id) {
  const res = await fetch(`${API_BASE}/admin/appointments/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  await parseResponse(res);
}
