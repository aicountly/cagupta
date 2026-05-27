/**
 * ledgerTxnChangeApprovalService.js — Team Approvals for protected ledger changes.
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
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

export async function listPendingLedgerTxnChanges() {
  const res = await fetch(`${API_BASE}/admin/approvals/ledger-txn-changes`, {
    headers: authHeaders(),
  });
  const data = await parseResponse(res);
  return data.data || [];
}

export async function approveLedgerTxnChange(id, body = {}) {
  const res = await fetch(`${API_BASE}/admin/approvals/ledger-txn-changes/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function rejectLedgerTxnChange(id, reason) {
  const res = await fetch(`${API_BASE}/admin/approvals/ledger-txn-changes/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  return parseResponse(res);
}

export function actionLabel(action) {
  const m = {
    update: 'Edit',
    reverse: 'Reverse',
    cancel: 'Cancel',
    cancel_reversal: 'Cancel reversal',
    reinstate: 'Reinstate',
  };
  return m[action] || action || 'Change';
}

/** Display label for txn_type on approval cards (includes firm bank/firm types). */
export function txnTypeLabelForApproval(txnType) {
  const t = String(txnType || '');
  const m = {
    firm_bank_transfer: 'Bank transfer',
    firm_expense: 'Firm expense',
    firm_inflow: 'Firm inflow',
    invoice: 'Invoice',
    receipt: 'Receipt',
    payment_expense: 'On-behalf payment',
    payment_client_cost: 'Client cost payment',
    tds_provisional: 'TDS (provisional)',
    tds_final: 'TDS (final)',
  };
  return m[t] || t.replace(/_/g, ' ') || '—';
}

export const LEDGER_TXN_INLINE_PREVIEW_LIMIT = 5;

/** Client / org display label from an approval txn snapshot. */
export function clientLabelForApprovalSnap(snap) {
  const name = String(snap?.client_name || '').trim();
  if (name && name !== 'Unknown') return name;
  const clientId = Number(snap?.client_id || 0);
  if (clientId > 0) return `Client #${clientId}`;
  return '';
}

/** Normalize single-txn vs bulk cancel snapshots from an approval row. */
export function ledgerApprovalTxnRows(row) {
  const snap = row?.txn_snapshot || {};
  if (Array.isArray(snap.bulk) && snap.bulk.length) return snap.bulk;
  if (snap.id || row?.txn_id) {
    return [snap.id ? snap : { ...snap, id: row.txn_id }];
  }
  return [];
}
