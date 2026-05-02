import { useState, useEffect, useCallback } from 'react';
import PartnerLayout from '../components/PartnerLayout';
import {
  getPartnerPayoutRequests,
  postPartnerPayoutRequest,
  getPartnerAccruals,
  getPartnerPayoutCycles,
} from '../services/partnerPortalService';

const STATUS_COLORS = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  approved: { bg: '#dbeafe', color: '#1e40af' },
  paid: { bg: '#dcfce7', color: '#166534' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
};

function anchorLabel(a) {
  if (a === 'd08') return '→ 8th';
  if (a === 'd15') return '→ 15th';
  if (a === 'd23') return '→ 23rd';
  if (a === 'eom') return 'Month-end';
  return a || '—';
}

export default function PartnerPayouts() {
  const [requests, setRequests] = useState([]);
  const [accruals, setAccruals] = useState([]);
  const [cycleYear, setCycleYear] = useState(() => new Date().getFullYear());
  const [cycleRows, setCycleRows] = useState([]);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [tab, setTab] = useState('requests');
  const [err, setErr] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setErr('');
    getPartnerPayoutRequests().then(setRequests).catch((e) => setErr(e.message));
    getPartnerAccruals().then(setAccruals).catch(() => {});
  }, []);

  const loadCycles = useCallback(() => {
    setCyclesLoading(true);
    getPartnerPayoutCycles(cycleYear)
      .then(setCycleRows)
      .catch(() => setCycleRows([]))
      .finally(() => setCyclesLoading(false));
  }, [cycleYear]);

  useEffect(() => {
    if (tab === 'cycles') loadCycles();
  }, [tab, loadCycles]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) { setErr('Enter a valid amount.'); return; }
    setSubmitting(true);
    try {
      await postPartnerPayoutRequest({ max_amount: val });
      setAmount('');
      load();
    } catch (ex) {
      setErr(ex.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  const tabBtn = (k, label) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: tab === k ? '2px solid #ea580c' : '1px solid #e2e8f0',
        background: tab === k ? '#fff7ed' : '#fff', color: '#0f172a',
      }}
    >
      {label}
    </button>
  );

  return (
    <PartnerLayout title="Payouts">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabBtn('requests', 'Payout Requests')}
        {tabBtn('accruals', 'Earnings')}
        {tabBtn('cycles', 'Payout cycles')}
        {tabBtn('new', 'Request Payout')}
      </div>

      {tab === 'new' && (
        <form onSubmit={handleSubmit} style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Maximum amount (₹)</label>
          <input
            type="number"
            step="0.01"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
            placeholder="e.g. 5000"
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 0', background: '#ea580c', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting…' : 'Submit Payout Request'}
          </button>
        </form>
      )}

      {tab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.length === 0 && <div style={{ color: '#94a3b8' }}>No payout requests yet.</div>}
          {requests.map((r) => {
            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
            return (
              <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>₹{Number(r.requested_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>
                  {r.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'accruals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {accruals.length === 0 && <div style={{ color: '#94a3b8' }}>No earnings yet.</div>}
          {accruals.map((a) => (
            <div key={a.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.service_title || `Service #${a.service_id}`}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {new Date(a.accrual_date).toLocaleDateString('en-IN')}
                  {a.rate_percent ? ` · ${a.rate_percent}%` : ''}
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>₹{Number(a.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'cycles' && (
        <div>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12, maxWidth: 520 }}>
            Office payout calendar (8th, 15th, 23rd, month-end). Amounts show your share for each period once a cycle is finalised, or eligible accrued earnings for open periods.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Year
              <input
                type="number"
                min={2000}
                max={2100}
                value={cycleYear}
                onChange={(e) => setCycleYear(Number(e.target.value))}
                style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', width: 96 }}
              />
            </label>
            <button
              type="button"
              onClick={loadCycles}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>
          {cyclesLoading && <div style={{ color: '#94a3b8' }}>Loading…</div>}
          {!cyclesLoading && cycleRows.length === 0 && (
            <div style={{ color: '#94a3b8' }}>No periods for this year.</div>
          )}
          {!cyclesLoading && cycleRows.length > 0 && (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                    {['Period', 'Anchor', 'Due', 'Cycle', 'Your total', 'Lines'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cycleRows.map((r) => {
                    const st = r.cycle?.status ?? '—';
                    const ps = r.partner_summary || {};
                    return (
                      <tr key={`${r.period_start}-${r.period_end}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px' }}>{r.period_start} → {r.period_end}</td>
                        <td style={{ padding: '10px 12px' }}>{anchorLabel(r.cycle_anchor)}</td>
                        <td style={{ padding: '10px 12px' }}>{r.disbursal_due_on}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{st}</td>
                        <td style={{ padding: '10px 12px' }}>
                          ₹{Number(ps.total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{ps.line_count ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PartnerLayout>
  );
}
