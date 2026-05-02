import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import {
  listPartnerPayoutCycles,
  ensurePartnerPayoutCycle,
  getPartnerPayoutCycle,
  previewPartnerPayoutCycle,
  finalisePartnerPayoutCycle,
  disbursePartnerPayoutCycle,
  submitPartnerPayoutCycleAmendment,
} from '../../../services/partnerPayoutCycleService';

const card = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const btnPrimary = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const btnGhost = { padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 };

function anchorLabel(a) {
  if (a === 'd08') return '→ 8th';
  if (a === 'd15') return '→ 15th';
  if (a === 'd23') return '→ 23rd';
  if (a === 'eom') return 'Month-end';
  return a;
}

export default function PartnerPayoutCycles() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('partners.manage');

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelErr, setPanelErr] = useState('');
  const [panelLoading, setPanelLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [adjJson, setAdjJson] = useState('[\n  { "partner_payout_accrual_id": 0, "amount_final": 0, "note": "" }\n]');

  const loadYear = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setErr('');
    try {
      const data = await listPartnerPayoutCycles(year);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, year]);

  useEffect(() => {
    loadYear();
  }, [loadYear]);

  async function openSegment(row) {
    if (!allowed) return;
    setPanelOpen(true);
    setPanelLoading(true);
    setPanelErr('');
    setDetail(null);
    setPreview(null);
    try {
      let cycleId = row.cycle?.id;
      if (!cycleId) {
        const ensured = await ensurePartnerPayoutCycle(row.period_end);
        cycleId = ensured?.id;
      }
      if (!cycleId) {
        throw new Error('Could not open cycle.');
      }
      const [djson, pjson] = await Promise.all([
        getPartnerPayoutCycle(cycleId),
        previewPartnerPayoutCycle(cycleId),
      ]);
      setDetail(djson);
      setPreview(pjson);
    } catch (e) {
      setPanelErr(e.message || 'Failed to load cycle');
    } finally {
      setPanelLoading(false);
    }
  }

  async function refreshPanel() {
    const id = detail?.cycle?.id;
    if (!id) return;
    setPanelLoading(true);
    setPanelErr('');
    try {
      const [djson, pjson] = await Promise.all([
        getPartnerPayoutCycle(id),
        previewPartnerPayoutCycle(id),
      ]);
      setDetail(djson);
      setPreview(pjson);
      await loadYear();
    } catch (e) {
      setPanelErr(e.message || 'Refresh failed');
    } finally {
      setPanelLoading(false);
    }
  }

  const cycle = detail?.cycle;
  const st = cycle?.status;

  async function onFinalise() {
    if (!cycle?.id) return;
    if (!window.confirm('Finalise this cycle at system-calculated amounts and reserve all eligible partner accruals?')) return;
    setBusy('fin');
    setPanelErr('');
    try {
      await finalisePartnerPayoutCycle(cycle.id);
      await refreshPanel();
    } catch (e) {
      setPanelErr(e.message || 'Finalise failed');
    } finally {
      setBusy('');
    }
  }

  async function onDisburse() {
    if (!cycle?.id) return;
    if (!window.confirm('Mark all accruals in this cycle as paid (disbursed)?')) return;
    setBusy('dis');
    setPanelErr('');
    try {
      await disbursePartnerPayoutCycle(cycle.id);
      await refreshPanel();
    } catch (e) {
      setPanelErr(e.message || 'Disburse failed');
    } finally {
      setBusy('');
    }
  }

  async function onSubmitAmendment() {
    if (!cycle?.id) return;
    let adjustments;
    try {
      adjustments = JSON.parse(adjJson);
    } catch {
      setPanelErr('Invalid JSON for adjustments.');
      return;
    }
    if (!Array.isArray(adjustments)) {
      setPanelErr('adjustments must be a JSON array.');
      return;
    }
    setBusy('amend');
    setPanelErr('');
    try {
      await submitPartnerPayoutCycleAmendment(cycle.id, adjustments);
      await refreshPanel();
    } catch (e) {
      setPanelErr(e.message || 'Submit failed');
    } finally {
      setBusy('');
    }
  }

  if (!allowed) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18 }}>Partner payout cycles</h1>
        <p style={{ color: '#64748b' }}>Requires partners.manage.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Partner payout cycles</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, maxWidth: 720 }}>
        Same schedule as affiliate payouts: <strong>8th</strong>, <strong>15th</strong>, <strong>23rd</strong>, <strong>month-end</strong>.
        Finalise partner accruals into a cycle, then mark disbursement. Adjustments need Super Admin approval (PR5).
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
          Year
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', width: 100 }}
          />
        </label>
        <button type="button" style={btnGhost} onClick={loadYear} disabled={loading}>Refresh</button>
      </div>

      {err && (
        <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 16 }}>{err}</div>
      )}

      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}

      {!loading && (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                {['Period', 'Anchor', 'Disburse by', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = r.cycle;
                const status = c?.status || '—';
                return (
                  <tr key={`${r.period_start}-${r.period_end}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px' }}>{r.period_start} → {r.period_end}</td>
                    <td style={{ padding: '10px 12px' }}>{anchorLabel(r.cycle_anchor)}</td>
                    <td style={{ padding: '10px 12px' }}>{r.disbursal_due_on}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{status}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button type="button" style={btnGhost} onClick={() => openSegment(r)}>Open</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panelOpen && (
        <div style={{ marginTop: 24, ...card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Cycle detail</h2>
            <button type="button" style={btnGhost} onClick={() => setPanelOpen(false)}>Close</button>
          </div>

          {panelLoading && <p style={{ color: '#64748b' }}>Loading…</p>}
          {panelErr && (
            <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{panelErr}</div>
          )}

          {detail?.cycle && !panelLoading && (
            <>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 12 }}>
                <div><strong>Period:</strong> {detail.cycle.period_start} → {detail.cycle.period_end}</div>
                <div><strong>Status:</strong> {detail.cycle.status}</div>
                <div><strong>Disburse by:</strong> {detail.cycle.disbursal_due_on}</div>
                {detail.cycle.status !== 'open' && (
                  <>
                    <div><strong>System total:</strong> ₹{Number(detail.cycle.total_system_amount || 0).toFixed(2)}</div>
                    <div><strong>Final total:</strong> ₹{Number(detail.cycle.total_final_amount || 0).toFixed(2)}</div>
                  </>
                )}
                {detail.pending_amendment && (
                  <div style={{ marginTop: 8, color: '#b45309', fontWeight: 600 }}>
                    Amendment #{detail.pending_amendment.id} pending Super Admin approval.
                  </div>
                )}
              </div>

              {st === 'open' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  <button type="button" style={btnPrimary} disabled={busy !== '' || !!detail.pending_amendment} onClick={onFinalise}>
                    {busy === 'fin' ? '…' : 'Finalise at system amounts'}
                  </button>
                </div>
              )}

              {st === 'finalised' && (
                <div style={{ marginBottom: 16 }}>
                  <button type="button" style={btnPrimary} disabled={busy !== ''} onClick={onDisburse}>
                    {busy === 'dis' ? '…' : 'Mark disbursed (paid)'}
                  </button>
                </div>
              )}

              {st === 'open' && !detail.pending_amendment && preview?.accruals?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Request amendment (JSON)</div>
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    Use <code>partner_payout_accrual_id</code> from the preview table. Only include rows where <code>amount_final</code> differs from the system amount.
                  </p>
                  <textarea
                    value={adjJson}
                    onChange={(e) => setAdjJson(e.target.value)}
                    rows={6}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }}
                  />
                  <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={busy !== ''} onClick={onSubmitAmendment}>
                    {busy === 'amend' ? '…' : 'Submit amendment'}
                  </button>
                </div>
              )}

              {preview?.by_partner?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Totals by partner (eligible accrued)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left' }}>
                        <th style={{ padding: 6, borderBottom: '1px solid #e2e8f0' }}>Partner</th>
                        <th style={{ padding: 6, borderBottom: '1px solid #e2e8f0' }}>Accrued total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.by_partner.map((x) => (
                        <tr key={x.user_id}>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{x.name || `User #${x.user_id}`}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>₹{Number(x.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview?.accruals?.length > 0 && (
                <div style={{ maxHeight: 280, overflow: 'auto' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Eligible accruals ({preview.accruals.length})</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left' }}>
                        {['ID', 'Partner', 'Date', 'Amount', 'Service'].map((h) => (
                          <th key={h} style={{ padding: 4, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.accruals.map((a) => (
                        <tr key={a.id}>
                          <td style={{ padding: 4, borderBottom: '1px solid #f8fafc' }}>{a.id}</td>
                          <td style={{ padding: 4, borderBottom: '1px solid #f8fafc' }}>{a.partner_user_id}</td>
                          <td style={{ padding: 4, borderBottom: '1px solid #f8fafc' }}>{a.accrual_date}</td>
                          <td style={{ padding: 4, borderBottom: '1px solid #f8fafc' }}>₹{Number(a.amount).toFixed(2)}</td>
                          <td style={{ padding: 4, borderBottom: '1px solid #f8fafc' }}>{a.service_id ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.lines?.length > 0 && (
                <div style={{ marginTop: 16, maxHeight: 240, overflow: 'auto' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Cycle lines (finalised)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: '#64748b' }}>
                        {['Accrual', 'Partner', 'System', 'Final'].map((h) => (
                          <th key={h} style={{ padding: 4, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((ln) => (
                        <tr key={ln.id}>
                          <td style={{ padding: 4 }}>{ln.partner_payout_accrual_id}</td>
                          <td style={{ padding: 4 }}>{ln.partner_name || ln.partner_user_id}</td>
                          <td style={{ padding: 4 }}>₹{Number(ln.amount_system).toFixed(2)}</td>
                          <td style={{ padding: 4 }}>₹{Number(ln.amount_final).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
