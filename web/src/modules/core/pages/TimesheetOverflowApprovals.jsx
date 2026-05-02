import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import {
  listPendingTimesheetOverflowRequests,
  approveTimesheetOverflowRequest,
  rejectTimesheetOverflowRequest,
} from '../services/timesheetOverflowApprovalService';

export default function TimesheetOverflowApprovals() {
  const { user } = useAuth();
  const allowed =
    String(user?.role || '').toLowerCase() === ROLES.SUPER_ADMIN ||
    String(user?.email || '').toLowerCase() === 'rahul@cagupta.in';

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
      .catch((e) => {
        setErr(e.message || 'Failed to load');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [allowed]);

  useEffect(() => {
    load();
  }, [load]);

  async function onApprove(id, modifyMinutes) {
    setBusyId(id);
    setErr('');
    try {
      const body = {};
      if (modifyMinutes !== '' && modifyMinutes != null) {
        const n = parseInt(String(modifyMinutes), 10);
        if (Number.isFinite(n) && n > 0) body.approved_duration_minutes = n;
      }
      await approveTimesheetOverflowRequest(id, body);
      await load();
    } catch (e) {
      setErr(e.message || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id, reason) {
    setBusyId(id);
    setErr('');
    try {
      await rejectTimesheetOverflowRequest(id, reason);
      await load();
    } catch (e) {
      setErr(e.message || 'Reject failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18 }}>Timesheet overflow approvals</h1>
        <p style={{ color: '#64748b' }}>Super Admin only.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Timesheet overflow approvals</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Requests to log time beyond 3 × standard allowable hours for the engagement type (PR3).
      </p>

      <button
        type="button"
        onClick={load}
        disabled={loading}
        style={{
          marginBottom: 16,
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid #E6E8F0',
          background: '#fff',
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: 600,
        }}
      >
        Refresh
      </button>

      {err && (
        <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 16 }}>
          {err}
        </div>
      )}

      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

      {!loading && rows.length === 0 && (
        <p style={{ color: '#64748b' }}>No pending requests.</p>
      )}

      {!loading &&
        rows.map((r) => (
          <OverflowRow key={r.id} row={r} busy={busyId === r.id} onApprove={onApprove} onReject={onReject} />
        ))}
    </div>
  );
}

function OverflowRow({ row, busy, onApprove, onReject }) {
  const [modifyMin, setModifyMin] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const kind = row.source_kind || '';
  const svc = row.service_type || '';
  const client = row.client_name || '';

  return (
    <div
      style={{
        border: '1px solid #E6E8F0',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
        Request #{row.id} · {kind.replace(/_/g, ' ')}
      </div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
        <div>{svc} — {client}</div>
        <div>User: {row.user_name || row.user_id}</div>
        <div>
          Requested: {row.duration_minutes_requested} min · {row.work_date} · {String(row.activity_type || '').replace(/_/g, ' ')}
        </div>
        {row.notes ? <div style={{ marginTop: 6 }}>Notes: {row.notes}</div> : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          Approve with minutes (optional)
          <input
            type="number"
            min={1}
            max={1440}
            placeholder={String(row.duration_minutes_requested)}
            value={modifyMin}
            onChange={(e) => setModifyMin(e.target.value)}
            style={{ width: 90, padding: 6, borderRadius: 6, border: '1px solid #E6E8F0' }}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(row.id, modifyMin)}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowReject((s) => !s)}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #fecaca',
            background: '#fff',
            color: '#b91c1c',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          Reject…
        </button>
      </div>

      {showReject && (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection"
            rows={2}
            style={{ width: '100%', maxWidth: 480, padding: 8, borderRadius: 8, border: '1px solid #E6E8F0' }}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(row.id, rejectReason)}
            style={{
              marginTop: 8,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Confirm reject
          </button>
        </div>
      )}
    </div>
  );
}
