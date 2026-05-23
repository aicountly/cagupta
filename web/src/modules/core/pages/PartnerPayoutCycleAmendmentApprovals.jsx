import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import { SUPER_ADMIN_EMAIL } from '../../../constants/config';
import {
  listPendingPartnerPayoutCycleAmendments,
  approvePartnerPayoutCycleAmendment,
  rejectPartnerPayoutCycleAmendment,
} from '../../../services/partnerPayoutCycleService';

const btnPrimary = { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--portal-primary)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const btnGhost = { padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 };

function parseAdj(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export default function PartnerPayoutCycleAmendmentApprovals() {
  const { user } = useAuth();
  const allowed =
    String(user?.role || '').toLowerCase() === ROLES.SUPER_ADMIN
    || String(user?.email || '').toLowerCase() === String(SUPER_ADMIN_EMAIL).toLowerCase();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    setErr('');
    listPendingPartnerPayoutCycleAmendments()
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

  async function onApprove(id) {
    setBusyId(id);
    setErr('');
    try {
      await approvePartnerPayoutCycleAmendment(id);
      await load();
    } catch (e) {
      setErr(e.message || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id) {
    const reason = window.prompt('Rejection reason (required):');
    if (reason == null || !String(reason).trim()) {
      return;
    }
    setBusyId(id);
    setErr('');
    try {
      await rejectPartnerPayoutCycleAmendment(id, String(reason).trim());
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
        <h1 style={{ fontSize: 18 }}>Partner payout amendments</h1>
        <p style={{ color: '#64748b' }}>Super Admin only.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Partner payout cycle amendments</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Approving applies Accounts&apos; proposed amounts and <strong>finalises</strong> the partner cycle (PR5).
      </p>
      <button type="button" style={btnGhost} onClick={load} disabled={loading}>Refresh</button>

      {err && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8 }}>{err}</div>
      )}

      {loading && <p style={{ color: '#64748b', marginTop: 12 }}>Loading…</p>}

      {!loading && rows.length === 0 && (
        <p style={{ color: '#64748b', marginTop: 12 }}>No pending amendments.</p>
      )}

      {!loading && rows.map((r) => {
        const adj = parseAdj(r.adjustments_json);
        return (
          <div
            key={r.id}
            style={{
              border: '1px solid #E6E8F0',
              borderRadius: 12,
              padding: 16,
              marginTop: 12,
              background: '#fff',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
              Amendment #{r.id} · Cycle #{r.partner_payout_cycle_id}
            </div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              <div>Period: {r.period_start} → {r.period_end} ({r.cycle_anchor})</div>
              <div>Requested by: {r.requested_by_name || r.requested_by_user_id}</div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, fontFamily: 'monospace', background: '#f8fafc', padding: 10, borderRadius: 8, overflowX: 'auto' }}>
              {adj.map((a) => (
                <div key={a.partner_payout_accrual_id}>
                  accrual {a.partner_payout_accrual_id} → ₹{Number(a.amount_final).toFixed(2)}
                  {a.note ? ` (${a.note})` : ''}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={busyId === r.id}
                onClick={() => onApprove(r.id)}
              >
                {busyId === r.id ? '…' : 'Approve & finalise'}
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={busyId === r.id}
                onClick={() => onReject(r.id)}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
