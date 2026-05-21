import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import { CheckSquare, Clock, Wallet, AlertCircle, Users, Filter, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  listPendingTimesheetOverflowRequests,
  approveTimesheetOverflowRequest,
  rejectTimesheetOverflowRequest,
} from '../services/timesheetOverflowApprovalService';
import {
  listPendingAffiliatePayoutCycleAmendments,
  approveAffiliatePayoutCycleAmendment,
  rejectAffiliatePayoutCycleAmendment,
} from '../../../services/affiliatePayoutCycleService';
import {
  listPendingPartnerPayoutCycleAmendments,
  approvePartnerPayoutCycleAmendment,
  rejectPartnerPayoutCycleAmendment,
} from '../../../services/partnerPayoutCycleService';
import {
  listPendingClientMasterNameChanges,
  approveClientMasterNameChange,
  rejectClientMasterNameChange,
  entityTypeLabel,
  entityEditPath,
} from '../services/clientMasterNameChangeApprovalService';
import {
  listPendingLedgerTxnChanges,
  approveLedgerTxnChange,
  rejectLedgerTxnChange,
  actionLabel as ledgerActionLabel,
  txnTypeLabelForApproval,
} from '../services/ledgerTxnChangeApprovalService';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'timesheet', label: 'Timesheet overflow', icon: Clock },
  { key: 'affiliate', label: 'Affiliate amendments', icon: Wallet },
  { key: 'partner', label: 'Partner amendments', icon: Wallet },
  { key: 'client_names', label: 'Client master names', icon: Users },
  { key: 'ledger', label: 'Ledger changes', icon: FileText },
];

const TYPE_META = {
  timesheet: { label: 'Timesheet overflow', color: '#0369a1', bg: '#E0F2FE' },
  affiliate: { label: 'Affiliate payout', color: '#7C3AED', bg: '#EDE9FE' },
  partner: { label: 'Partner payout', color: '#0D9488', bg: '#CCFBF1' },
  client_names: { label: 'Client master name', color: '#B45309', bg: '#FEF3C7' },
  ledger: { label: 'Ledger change', color: '#0369a1', bg: '#E0F2FE' },
};

function parseAdj(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

function busyKey(type, id) {
  return `${type}:${id}`;
}

function sortKey(row) {
  const ts = row.created_at || row.submitted_at || row.requested_at;
  if (ts) return new Date(ts).getTime();
  return Number(row.id || row.approval_id || 0);
}

function StatusBadge({ label, color }) {
  const colors = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    approved: { bg: '#DCFCE7', text: '#166534' },
    rejected: { bg: '#FEE2E2', text: '#991B1B' },
  };
  const c = colors[color] || colors.pending;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}>
      {label}
    </span>
  );
}

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { label: type, color: '#475569', bg: '#F1F5F9' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: meta.bg, color: meta.color,
    }}>
      {meta.label}
    </span>
  );
}

function OverflowCard({ row, busy, onApprove, onReject }) {
  const [modifyMin, setModifyMin] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
            Request #{row.id}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {(row.source_kind || '').replace(/_/g, ' ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <TypeBadge type="timesheet" />
          <StatusBadge label="Pending" color="pending" />
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
        <div><strong>Service:</strong> {row.service_type || '—'} — {row.client_name || '—'}</div>
        <div><strong>User:</strong> {row.user_name || row.user_id}</div>
        <div><strong>Requested:</strong> {row.duration_minutes_requested} min on {row.work_date}</div>
        {row.notes && <div style={{ marginTop: 4 }}><strong>Notes:</strong> {row.notes}</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#64748b' }}>
          Override minutes
          <input type="number" min={1} max={1440} placeholder={String(row.duration_minutes_requested)} value={modifyMin} onChange={(e) => setModifyMin(e.target.value)} style={inputSm} disabled={busy} />
        </label>
        <button type="button" disabled={busy} onClick={() => onApprove(row.id, modifyMin)} style={btnApprove}>
          {busy ? 'Processing...' : 'Approve'}
        </button>
        <button type="button" disabled={busy} onClick={() => setShowReject((s) => !s)} style={btnReject}>
          Reject
        </button>
      </div>
      {showReject && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection" rows={2} style={{ ...inputSm, width: '100%', maxWidth: 400, minHeight: 56 }} disabled={busy} />
          <button type="button" disabled={busy || !rejectReason.trim()} onClick={() => onReject(row.id, rejectReason)} style={{ ...btnReject, background: '#DC2626', color: '#fff', border: 'none' }}>
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

function PayoutAmendmentCard({ kind, row, busy, onApprove, onReject }) {
  const isAffiliate = kind === 'affiliate';
  const idKey = isAffiliate ? 'commission_accrual_id' : 'partner_payout_accrual_id';
  const cycleIdKey = isAffiliate ? 'affiliate_payout_cycle_id' : 'partner_payout_cycle_id';
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const adj = parseAdj(row.adjustments_json);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
            Amendment #{row.id} — Cycle #{row[cycleIdKey]}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {row.period_start} to {row.period_end} ({row.cycle_anchor})
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <TypeBadge type={kind} />
          <StatusBadge label="Pending approval" color="pending" />
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
        Requested by: <strong>{row.requested_by_name || row.requested_by_user_id}</strong>
      </div>
      {adj.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={thStyle}>Accrual ID</th>
                <th style={thStyle}>Proposed Amount</th>
                <th style={thStyle}>Note</th>
              </tr>
            </thead>
            <tbody>
              {adj.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>{a[idKey]}</td>
                  <td style={tdStyle}>₹{Number(a.amount_final).toFixed(2)}</td>
                  <td style={tdStyle}>{a.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" style={btnApprove} disabled={busy} onClick={() => onApprove(row.id)}>
          {busy ? 'Processing...' : 'Approve & Finalise'}
        </button>
        <button type="button" style={btnReject} disabled={busy} onClick={() => setShowReject((s) => !s)}>
          Reject
        </button>
      </div>
      {showReject && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            rows={2}
            style={{ ...inputSm, width: '100%', maxWidth: 400, minHeight: 56 }}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || !rejectReason.trim()}
            onClick={() => onReject(row.id, rejectReason)}
            style={{ ...btnReject, background: '#DC2626', color: '#fff', border: 'none' }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

function LedgerTxnChangeCard({ row, busy, onApprove, onReject }) {
  const [decisionNotes, setDecisionNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const approvalId = row.approval_id || row.id;
  const snap = row.txn_snapshot || {};
  const action = row.action || '';
  const label = row.action_label || ledgerActionLabel(action);
  const ids = row.payload?.ids;
  const isBulkCancel = action === 'cancel' && Array.isArray(ids) && ids.length > 1;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
            Approval #{approvalId} — {label}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {isBulkCancel
              ? `Cancel ${ids.length} ledger records`
              : row.txn_id
                ? `Txn #${row.txn_id} · ${txnTypeLabelForApproval(snap.txn_type)}`
                : 'Bulk ledger cancel'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <TypeBadge type="ledger" />
          <StatusBadge label="Pending" color="pending" />
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
        {!isBulkCancel && (
          <>
            <div><strong>Ref:</strong> {snap.public_ref || snap.invoice_number || '—'}</div>
            <div><strong>Date:</strong> {snap.txn_date || '—'} · <strong>Amount:</strong> ₹{Number(snap.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </>
        )}
        {isBulkCancel && (
          <div><strong>Txn ids:</strong> {ids.join(', ')}</div>
        )}
        <div><strong>Requested by:</strong> {row.requested_by_name || row.requested_by_user_id || '—'}</div>
        {row.request_reason && <div><strong>Reason:</strong> {row.request_reason}</div>}
        {action === 'update' && row.payload && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
            Proposed field changes are stored in the approval payload and applied on approve.
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', flex: '1 1 200px' }}>
          Decision notes (optional)
          <input
            type="text"
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            style={{ ...inputSm, flex: 1, minWidth: 160 }}
            disabled={busy}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => onApprove(approvalId, decisionNotes)} style={btnApprove}>
          {busy ? 'Processing...' : 'Approve'}
        </button>
        <button type="button" disabled={busy} onClick={() => setShowReject((s) => !s)} style={btnReject}>
          Reject
        </button>
      </div>
      {showReject && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            rows={2}
            style={{ ...inputSm, width: '100%', maxWidth: 400, minHeight: 56 }}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || !rejectReason.trim()}
            onClick={() => onReject(approvalId, rejectReason)}
            style={{ ...btnReject, background: '#DC2626', color: '#fff', border: 'none' }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

function ClientMasterNameCard({ row, busy, onApprove, onReject }) {
  const [decisionNotes, setDecisionNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const approvalId = row.approval_id || row.id;
  const entityId = row.entity_id;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
            Approval #{approvalId}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {entityTypeLabel(row.entity_type)} #{entityId}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <TypeBadge type="client_names" />
          <StatusBadge label="Pending" color="pending" />
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
        <div><strong>Current name:</strong> {row.current_name || '—'}</div>
        <div><strong>Proposed name:</strong> {row.proposed_name || '—'}</div>
        <div><strong>Requested by:</strong> {row.requested_by_name || row.requested_by_user_id || '—'}</div>
        {row.request_reason && <div><strong>Note:</strong> {row.request_reason}</div>}
      </div>
      <div style={{ marginTop: 10 }}>
        <Link to={entityEditPath(row.entity_type, entityId)} style={{ fontSize: 12, color: '#0369a1' }}>
          Open {entityTypeLabel(row.entity_type).toLowerCase()} record
        </Link>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', flex: '1 1 200px' }}>
          Decision notes (optional)
          <input
            type="text"
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            style={{ ...inputSm, flex: 1, minWidth: 160 }}
            disabled={busy}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => onApprove(approvalId, decisionNotes)} style={btnApprove}>
          {busy ? 'Processing...' : 'Approve'}
        </button>
        <button type="button" disabled={busy} onClick={() => setShowReject((s) => !s)} style={btnReject}>
          Reject
        </button>
      </div>
      {showReject && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            rows={2}
            style={{ ...inputSm, width: '100%', maxWidth: 400, minHeight: 56 }}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || !rejectReason.trim()}
            onClick={() => onReject(approvalId, rejectReason)}
            style={{ ...btnReject, background: '#DC2626', color: '#fff', border: 'none' }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const allowed =
    String(user?.role || '').toLowerCase() === ROLES.SUPER_ADMIN
    || String(user?.email || '').toLowerCase() === 'rahul@cagupta.in';

  const [filter, setFilter] = useState('all');
  const [timesheet, setTimesheet] = useState([]);
  const [affiliate, setAffiliate] = useState([]);
  const [partner, setPartner] = useState([]);
  const [clientNames, setClientNames] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyKey, setBusyKey] = useState(null);

  const counts = useMemo(() => ({
    all: timesheet.length + affiliate.length + partner.length + clientNames.length + ledger.length,
    timesheet: timesheet.length,
    affiliate: affiliate.length,
    partner: partner.length,
    client_names: clientNames.length,
    ledger: ledger.length,
  }), [timesheet, affiliate, partner, clientNames, ledger]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setErr('');
    try {
      const [ts, aff, part, names, led] = await Promise.all([
        listPendingTimesheetOverflowRequests(),
        listPendingAffiliatePayoutCycleAmendments(),
        listPendingPartnerPayoutCycleAmendments(),
        listPendingClientMasterNameChanges(),
        listPendingLedgerTxnChanges(),
      ]);
      setTimesheet(Array.isArray(ts) ? ts : []);
      setAffiliate(Array.isArray(aff) ? aff : []);
      setPartner(Array.isArray(part) ? part : []);
      setClientNames(Array.isArray(names) ? names : []);
      setLedger(Array.isArray(led) ? led : []);
    } catch (e) {
      setErr(e.message || 'Failed to load approvals');
      setTimesheet([]);
      setAffiliate([]);
      setPartner([]);
      setClientNames([]);
      setLedger([]);
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    const list = [];
    const include = (type) => filter === 'all' || filter === type;

    if (include('timesheet')) {
      timesheet.forEach((row) => list.push({ type: 'timesheet', id: row.id, row, _sort: sortKey(row) }));
    }
    if (include('affiliate')) {
      affiliate.forEach((row) => list.push({ type: 'affiliate', id: row.id, row, _sort: sortKey(row) }));
    }
    if (include('partner')) {
      partner.forEach((row) => list.push({ type: 'partner', id: row.id, row, _sort: sortKey(row) }));
    }
    if (include('client_names')) {
      clientNames.forEach((row) => {
        const id = row.approval_id || row.id;
        list.push({ type: 'client_names', id, row, _sort: sortKey(row) });
      });
    }
    if (include('ledger')) {
      ledger.forEach((row) => {
        const id = row.approval_id || row.id;
        list.push({ type: 'ledger', id, row, _sort: sortKey(row) });
      });
    }

    return list.sort((a, b) => b._sort - a._sort);
  }, [filter, timesheet, affiliate, partner, clientNames, ledger]);

  async function runAction(key, fn) {
    setBusyKey(key);
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message || 'Action failed');
    } finally {
      setBusyKey(null);
    }
  }

  if (!allowed) {
    return (
      <div style={pageWrap}>
        <div style={pageHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconWrap}><CheckSquare size={20} color="#F37920" /></div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Approvals</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Super Admin access required.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={iconWrap}><CheckSquare size={20} color="#F37920" /></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Team Approvals</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {counts.all === 0
                ? 'No pending approval requests'
                : `${counts.all} pending request${counts.all === 1 ? '' : 's'} across all workflows`}
            </div>
          </div>
        </div>
      </div>

      <div style={toolbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12, fontWeight: 600, marginRight: 4 }}>
          <Filter size={14} />
          Filter
        </div>
        {FILTER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = filter === opt.key;
          const count = counts[opt.key] ?? 0;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                border: '1px solid', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: isActive ? '#F37920' : '#fff',
                color: isActive ? '#fff' : '#475569',
                borderColor: isActive ? '#F37920' : '#E6E8F0',
              }}
            >
              {Icon && <Icon size={14} />}
              {opt.label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                background: isActive ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                color: isActive ? '#fff' : '#64748b',
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={contentArea}>
        {loading && <div style={emptyState}>Loading approvals...</div>}
        {!loading && err && (
          <div style={errorBanner}>
            <AlertCircle size={14} /> {err}
          </div>
        )}
        {!loading && !err && items.length === 0 && (
          <div style={emptyState}>
            {filter === 'all'
              ? 'No pending approval requests.'
              : `No pending ${FILTER_OPTIONS.find((o) => o.key === filter)?.label?.toLowerCase() || ''} requests.`}
          </div>
        )}
        {!loading && !err && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item) => {
              const key = busyKey(item.type, item.id);
              const busy = busyKey === key;

              if (item.type === 'timesheet') {
                return (
                  <OverflowCard
                    key={key}
                    row={item.row}
                    busy={busy}
                    onApprove={(id, modifyMin) => runAction(key, async () => {
                      const body = {};
                      if (modifyMin) {
                        const n = parseInt(String(modifyMin), 10);
                        if (Number.isFinite(n) && n > 0) body.approved_duration_minutes = n;
                      }
                      await approveTimesheetOverflowRequest(id, body);
                    })}
                    onReject={(id, reason) => runAction(key, () => rejectTimesheetOverflowRequest(id, reason))}
                  />
                );
              }

              if (item.type === 'affiliate' || item.type === 'partner') {
                const approveFn = item.type === 'affiliate'
                  ? approveAffiliatePayoutCycleAmendment
                  : approvePartnerPayoutCycleAmendment;
                const rejectFn = item.type === 'affiliate'
                  ? rejectAffiliatePayoutCycleAmendment
                  : rejectPartnerPayoutCycleAmendment;
                return (
                  <PayoutAmendmentCard
                    key={key}
                    kind={item.type}
                    row={item.row}
                    busy={busy}
                    onApprove={(id) => runAction(key, () => approveFn(id))}
                    onReject={(id, reason) => runAction(key, () => rejectFn(id, reason))}
                  />
                );
              }

              if (item.type === 'ledger') {
                return (
                  <LedgerTxnChangeCard
                    key={key}
                    row={item.row}
                    busy={busy}
                    onApprove={(id, decisionNotes) => runAction(key, async () => {
                      const body = {};
                      if (decisionNotes?.trim()) body.decision_notes = decisionNotes.trim();
                      await approveLedgerTxnChange(id, body);
                    })}
                    onReject={(id, reason) => runAction(key, () => rejectLedgerTxnChange(id, reason))}
                  />
                );
              }

              return (
                <ClientMasterNameCard
                  key={key}
                  row={item.row}
                  busy={busy}
                  onApprove={(id, decisionNotes) => runAction(key, async () => {
                    const body = {};
                    if (decisionNotes?.trim()) body.decision_notes = decisionNotes.trim();
                    await approveClientMasterNameChange(id, body);
                  })}
                  onReject={(id, reason) => runAction(key, () => rejectClientMasterNameChange(id, reason))}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const pageWrap = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const pageHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' };
const iconWrap = { width: 44, height: 44, borderRadius: 12, background: '#FEF0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const toolbar = { display: 'flex', gap: 8, background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', flexWrap: 'wrap', alignItems: 'center' };
const contentArea = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: 20, minHeight: 200 };
const card = { border: '1px solid #E6E8F0', borderRadius: 12, padding: 16, background: '#FAFBFD' };
const emptyState = { fontSize: 13, color: '#94a3b8', padding: 20, textAlign: 'center' };
const errorBanner = { display: 'flex', alignItems: 'center', gap: 8, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 };
const btnApprove = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, boxShadow: '0 2px 8px rgba(243,121,32,0.25)' };
const btnReject = { padding: '8px 16px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#fff', color: '#DC2626', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const inputSm = { padding: '6px 10px', borderRadius: 6, border: '1px solid #E6E8F0', fontSize: 13, boxSizing: 'border-box' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #E6E8F0', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '8px 10px', color: '#334155' };
