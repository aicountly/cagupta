import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import { CheckSquare, Clock, Wallet, AlertCircle, Users } from 'lucide-react';
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

function parseAdj(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j : [];
  } catch { return []; }
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

function TimesheetOverflowTab({ allowed }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    setErr('');
    listPendingTimesheetOverflowRequests()
      .then(setRows)
      .catch((e) => { setErr(e.message || 'Failed'); setRows([]); })
      .finally(() => setLoading(false));
  }, [allowed]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id, modifyMin) {
    setBusyId(id);
    setErr('');
    try {
      const body = {};
      if (modifyMin) {
        const n = parseInt(String(modifyMin), 10);
        if (Number.isFinite(n) && n > 0) body.approved_duration_minutes = n;
      }
      await approveTimesheetOverflowRequest(id, body);
      await load();
    } catch (e) { setErr(e.message || 'Approve failed'); }
    finally { setBusyId(null); }
  }

  async function handleReject(id, reason) {
    setBusyId(id);
    setErr('');
    try {
      await rejectTimesheetOverflowRequest(id, reason);
      await load();
    } catch (e) { setErr(e.message || 'Reject failed'); }
    finally { setBusyId(null); }
  }

  if (loading) return <div style={emptyState}>Loading requests...</div>;
  if (err) return <div style={errorBanner}><AlertCircle size={14} /> {err}</div>;
  if (rows.length === 0) return <div style={emptyState}>No pending timesheet overflow requests.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => (
        <OverflowCard key={r.id} row={r} busy={busyId === r.id} onApprove={handleApprove} onReject={handleReject} />
      ))}
    </div>
  );
}

function OverflowCard({ row, busy, onApprove, onReject }) {
  const [modifyMin, setModifyMin] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
            Request #{row.id}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {(row.source_kind || '').replace(/_/g, ' ')}
          </div>
        </div>
        <StatusBadge label="Pending" color="pending" />
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

function PayoutAmendmentTab({ kind, allowed }) {
  const isAffiliate = kind === 'affiliate';
  const listFn = isAffiliate ? listPendingAffiliatePayoutCycleAmendments : listPendingPartnerPayoutCycleAmendments;
  const approveFn = isAffiliate ? approveAffiliatePayoutCycleAmendment : approvePartnerPayoutCycleAmendment;
  const rejectFn = isAffiliate ? rejectAffiliatePayoutCycleAmendment : rejectPartnerPayoutCycleAmendment;
  const idKey = isAffiliate ? 'commission_accrual_id' : 'partner_payout_accrual_id';
  const cycleIdKey = isAffiliate ? 'affiliate_payout_cycle_id' : 'partner_payout_cycle_id';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    setErr('');
    listFn()
      .then(setRows)
      .catch((e) => { setErr(e.message || 'Failed'); setRows([]); })
      .finally(() => setLoading(false));
  }, [allowed, listFn]);

  useEffect(() => { load(); }, [load]);

  async function onApprove(id) {
    setBusyId(id);
    setErr('');
    try { await approveFn(id); await load(); }
    catch (e) { setErr(e.message || 'Approve failed'); }
    finally { setBusyId(null); }
  }

  async function onReject(id) {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) return;
    setBusyId(id);
    setErr('');
    try { await rejectFn(id, reason.trim()); await load(); }
    catch (e) { setErr(e.message || 'Reject failed'); }
    finally { setBusyId(null); }
  }

  if (loading) return <div style={emptyState}>Loading amendments...</div>;
  if (err) return <div style={errorBanner}><AlertCircle size={14} /> {err}</div>;
  if (rows.length === 0) return <div style={emptyState}>No pending {isAffiliate ? 'affiliate' : 'partner'} payout amendments.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => {
        const adj = parseAdj(r.adjustments_json);
        return (
          <div key={r.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
                  Amendment #{r.id} — Cycle #{r[cycleIdKey]}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {r.period_start} to {r.period_end} ({r.cycle_anchor})
                </div>
              </div>
              <StatusBadge label="Pending approval" color="pending" />
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
              Requested by: <strong>{r.requested_by_name || r.requested_by_user_id}</strong>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={btnApprove} disabled={busyId === r.id} onClick={() => onApprove(r.id)}>
                {busyId === r.id ? 'Processing...' : 'Approve & Finalise'}
              </button>
              <button type="button" style={btnReject} disabled={busyId === r.id} onClick={() => onReject(r.id)}>
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClientMasterNameTab({ allowed }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    setErr('');
    listPendingClientMasterNameChanges()
      .then(setRows)
      .catch((e) => { setErr(e.message || 'Failed'); setRows([]); })
      .finally(() => setLoading(false));
  }, [allowed]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id, decisionNotes) {
    setBusyId(id);
    setErr('');
    try {
      const body = {};
      if (decisionNotes?.trim()) body.decision_notes = decisionNotes.trim();
      await approveClientMasterNameChange(id, body);
      await load();
    } catch (e) { setErr(e.message || 'Approve failed'); }
    finally { setBusyId(null); }
  }

  async function handleReject(id, reason) {
    setBusyId(id);
    setErr('');
    try {
      await rejectClientMasterNameChange(id, reason);
      await load();
    } catch (e) { setErr(e.message || 'Reject failed'); }
    finally { setBusyId(null); }
  }

  if (loading) return <div style={emptyState}>Loading name change requests...</div>;
  if (err) return <div style={errorBanner}><AlertCircle size={14} /> {err}</div>;
  if (rows.length === 0) return <div style={emptyState}>No pending client master name changes.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => (
        <ClientMasterNameCard
          key={r.approval_id || r.id}
          row={r}
          busy={busyId === (r.approval_id || r.id)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
            Approval #{approvalId}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {entityTypeLabel(row.entity_type)} #{entityId}
          </div>
        </div>
        <StatusBadge label="Pending" color="pending" />
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

const TABS = [
  { key: 'timesheet', label: 'Timesheet Overflow', icon: Clock },
  { key: 'affiliate', label: 'Affiliate Amendments', icon: Wallet },
  { key: 'partner', label: 'Partner Amendments', icon: Wallet },
  { key: 'client_names', label: 'Client Master Names', icon: Users },
];

export default function Approvals() {
  const { user } = useAuth();
  const allowed =
    String(user?.role || '').toLowerCase() === ROLES.SUPER_ADMIN
    || String(user?.email || '').toLowerCase() === 'rahul@cagupta.in';

  const [tab, setTab] = useState('timesheet');

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
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Approvals</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              Review and approve pending requests across all workflows
            </div>
          </div>
        </div>
      </div>

      <div style={toolbar}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: isActive ? '#F37920' : '#fff',
                color: isActive ? '#fff' : '#475569',
                borderColor: isActive ? '#F37920' : '#E6E8F0',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={contentArea}>
        {tab === 'timesheet' && <TimesheetOverflowTab allowed={allowed} />}
        {tab === 'affiliate' && <PayoutAmendmentTab kind="affiliate" allowed={allowed} />}
        {tab === 'partner' && <PayoutAmendmentTab kind="partner" allowed={allowed} />}
        {tab === 'client_names' && <ClientMasterNameTab allowed={allowed} />}
      </div>
    </div>
  );
}

const pageWrap = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const pageHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' };
const iconWrap = { width: 44, height: 44, borderRadius: 12, background: '#FEF0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const toolbar = { display: 'flex', gap: 8, background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', flexWrap: 'wrap' };
const contentArea = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: 20, minHeight: 200 };
const card = { border: '1px solid #E6E8F0', borderRadius: 12, padding: 16, background: '#FAFBFD' };
const emptyState = { fontSize: 13, color: '#94a3b8', padding: 20, textAlign: 'center' };
const errorBanner = { display: 'flex', alignItems: 'center', gap: 8, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', fontSize: 13 };
const btnApprove = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, boxShadow: '0 2px 8px rgba(243,121,32,0.25)' };
const btnReject = { padding: '8px 16px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#fff', color: '#DC2626', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const inputSm = { padding: '6px 10px', borderRadius: 6, border: '1px solid #E6E8F0', fontSize: 13, boxSizing: 'border-box' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #E6E8F0', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '8px 10px', color: '#334155' };
