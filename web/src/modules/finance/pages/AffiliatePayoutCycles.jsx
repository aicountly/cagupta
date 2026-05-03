import { useState, useEffect, useCallback } from 'react';
import { Wallet, RefreshCw, CheckCircle2, Clock, AlertTriangle, XCircle, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import {
  listAffiliatePayoutCycles,
  ensureAffiliatePayoutCycle,
  getAffiliatePayoutCycle,
  previewAffiliatePayoutCycle,
  finaliseAffiliatePayoutCycle,
  disburseAffiliatePayoutCycle,
  submitAffiliatePayoutCycleAmendment,
} from '../../../services/affiliatePayoutCycleService';

const STATUS_CONFIG = {
  open: { label: 'Open', color: '#2563EB', bg: '#DBEAFE', icon: Clock },
  finalised: { label: 'Finalised', color: '#D97706', bg: '#FEF3C7', icon: AlertTriangle },
  disbursed: { label: 'Disbursed', color: '#16A34A', bg: '#DCFCE7', icon: CheckCircle2 },
  closed: { label: 'Closed', color: '#64748b', bg: '#F1F5F9', icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const Icon = cfg.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color }}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E6E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>{value}</div>
      </div>
    </div>
  );
}

function AmendmentForm({ cycleId, onSuccess }) {
  const [rows, setRows] = useState([{ accrual_id: '', amount: '', note: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function updateRow(idx, field, value) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }
  function addRow() { setRows((prev) => [...prev, { accrual_id: '', amount: '', note: '' }]); }
  function removeRow(idx) { setRows((prev) => prev.filter((_, i) => i !== idx)); }

  async function submit(e) {
    e.preventDefault();
    const adjustments = rows
      .filter((r) => r.accrual_id && r.amount)
      .map((r) => ({ commission_accrual_id: parseInt(r.accrual_id, 10), amount_final: parseFloat(r.amount), note: r.note || undefined }));
    if (adjustments.length === 0) { setErr('Add at least one valid adjustment'); return; }
    setBusy(true); setErr('');
    try {
      await submitAffiliatePayoutCycleAmendment(cycleId, adjustments);
      setRows([{ accrual_id: '', amount: '', note: '' }]);
      onSuccess?.();
    } catch (ex) { setErr(ex.message || 'Submit failed'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16, padding: 16, background: '#FAFBFD', borderRadius: 10, border: '1px solid #E6E8F0' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#0B1F3B' }}>Submit Amendment</div>
      {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><th style={thSm}>Accrual ID</th><th style={thSm}>Proposed Amount (₹)</th><th style={thSm}>Note</th><th style={thSm}></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={tdSm}><input style={inputSm} type="number" placeholder="ID" value={r.accrual_id} onChange={(e) => updateRow(i, 'accrual_id', e.target.value)} /></td>
                <td style={tdSm}><input style={inputSm} type="number" step="0.01" placeholder="Amount" value={r.amount} onChange={(e) => updateRow(i, 'amount', e.target.value)} /></td>
                <td style={tdSm}><input style={inputSm} placeholder="Note" value={r.note} onChange={(e) => updateRow(i, 'note', e.target.value)} /></td>
                <td style={tdSm}>{rows.length > 1 && <button type="button" onClick={() => removeRow(i)} style={{ ...btnSmGhost, color: '#DC2626' }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={addRow} style={btnSmGhost}><Plus size={12} /> Add Row</button>
        <button type="submit" disabled={busy} style={btnSmPrimary}>{busy ? 'Submitting...' : 'Submit for Approval'}</button>
      </div>
    </form>
  );
}

function CycleDetailPanel({ cycle, onAction }) {
  const [tab, setTab] = useState('accruals');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const data = await previewAffiliatePayoutCycle(cycle.id);
      setPreview(data);
    } catch (e) { setErr(e.message); }
    finally { setLoadingPreview(false); }
  }

  useEffect(() => { loadPreview(); }, [cycle.id]);

  async function handleFinalise() {
    if (!window.confirm('Finalise this cycle? Accruals will be locked.')) return;
    setBusy('finalise'); setErr('');
    try { await finaliseAffiliatePayoutCycle(cycle.id); onAction?.(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  async function handleDisburse() {
    if (!window.confirm('Mark as disbursed? Payments will be recorded.')) return;
    setBusy('disburse'); setErr('');
    try { await disburseAffiliatePayoutCycle(cycle.id); onAction?.(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  const TABS = [
    { key: 'accruals', label: 'Eligible Accruals' },
    { key: 'hold_kyc', label: 'On Hold (KYC)' },
    { key: 'hold_unrealised', label: 'On Hold (Unrealised)' },
    { key: 'amendments', label: 'Amendments' },
    { key: 'payments', label: 'Payment History' },
  ];

  const accruals = preview?.accruals || preview?.line_items || [];
  const kycHeld = accruals.filter((a) => a.hold_reason === 'kyc_pending');
  const unrealisedHeld = accruals.filter((a) => a.hold_reason === 'unrealised');
  const eligible = accruals.filter((a) => !a.hold_reason);

  return (
    <div style={{ marginTop: 16, border: '1px solid #E6E8F0', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      {/* Cycle header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B' }}>
            Cycle #{cycle.id} — {cycle.period_start} to {cycle.period_end}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Anchor: {cycle.cycle_anchor}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={cycle.status} />
          {cycle.status === 'open' && (
            <button type="button" onClick={handleFinalise} disabled={!!busy} style={btnAction}>
              {busy === 'finalise' ? '...' : 'Finalise'}
            </button>
          )}
          {cycle.status === 'finalised' && (
            <button type="button" onClick={handleDisburse} disabled={!!busy} style={{ ...btnAction, background: '#16A34A' }}>
              {busy === 'disburse' ? '...' : 'Disburse'}
            </button>
          )}
        </div>
      </div>

      {err && <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 12 }}>{err}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', padding: '0 20px', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #F37920' : '2px solid transparent', color: tab === t.key ? '#F37920' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t.label}
            {t.key === 'hold_kyc' && kycHeld.length > 0 && <span style={{ marginLeft: 4, background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '1px 6px', fontSize: 10 }}>{kycHeld.length}</span>}
            {t.key === 'hold_unrealised' && unrealisedHeld.length > 0 && <span style={{ marginLeft: 4, background: '#FEF3C7', color: '#92400E', borderRadius: 8, padding: '1px 6px', fontSize: 10 }}>{unrealisedHeld.length}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: 20 }}>
        {loadingPreview && <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading cycle data...</div>}
        {!loadingPreview && tab === 'accruals' && (
          <AccrualTable rows={eligible} emptyMsg="No eligible accruals in this cycle." />
        )}
        {!loadingPreview && tab === 'hold_kyc' && (
          <AccrualTable rows={kycHeld} emptyMsg="No accruals on hold for KYC." holdType="kyc" />
        )}
        {!loadingPreview && tab === 'hold_unrealised' && (
          <AccrualTable rows={unrealisedHeld} emptyMsg="No accruals on hold for unrealised payments." holdType="unrealised" />
        )}
        {!loadingPreview && tab === 'amendments' && (
          <div>
            {cycle.status === 'open' && (
              <AmendmentForm cycleId={cycle.id} onSuccess={loadPreview} />
            )}
            {cycle.status !== 'open' && <div style={{ color: '#94a3b8', fontSize: 13 }}>Amendments only available for open cycles.</div>}
          </div>
        )}
        {!loadingPreview && tab === 'payments' && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            {cycle.status === 'disbursed' ? 'Payment records will appear here after disbursement processing.' : 'Payments recorded after disbursement.'}
          </div>
        )}
      </div>
    </div>
  );
}

function AccrualTable({ rows, emptyMsg, holdType }) {
  if (rows.length === 0) return <div style={{ color: '#94a3b8', fontSize: 13 }}>{emptyMsg}</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={thSm}>ID</th>
            <th style={thSm}>Affiliate</th>
            <th style={thSm}>Service</th>
            <th style={thSm}>Amount</th>
            {holdType && <th style={thSm}>Reason</th>}
            {holdType && <th style={thSm}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id || a.commission_accrual_id}>
              <td style={tdSm}>{a.id || a.commission_accrual_id}</td>
              <td style={tdSm}>{a.affiliate_name || a.affiliate_id || '—'}</td>
              <td style={tdSm}>{a.service_name || a.service_type || '—'}</td>
              <td style={{ ...tdSm, fontWeight: 600 }}>₹{Number(a.amount || a.commission_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              {holdType && <td style={tdSm}><span style={{ background: holdType === 'kyc' ? '#FEE2E2' : '#FEF3C7', color: holdType === 'kyc' ? '#991B1B' : '#92400E', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>{holdType === 'kyc' ? 'KYC Pending' : 'Unrealised'}</span></td>}
              {holdType && <td style={tdSm}><button type="button" style={btnSmGhost}>Unhold</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AffiliatePayoutCycles() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newPeriodEnd, setNewPeriodEnd] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const data = await listAffiliatePayoutCycles(year);
      setCycles(data);
    } catch (e) { setErr(e.message || 'Failed to load cycles'); setCycles([]); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  async function createCycle(e) {
    e.preventDefault();
    if (!newPeriodEnd) return;
    setCreating(true); setErr('');
    try {
      await ensureAffiliatePayoutCycle(newPeriodEnd);
      setNewPeriodEnd('');
      await load();
    } catch (ex) { setErr(ex.message || 'Create failed'); }
    finally { setCreating(false); }
  }

  const openCount = cycles.filter((c) => c.status === 'open').length;
  const finalisedCount = cycles.filter((c) => c.status === 'finalised').length;
  const disbursedCount = cycles.filter((c) => c.status === 'disbursed').length;

  return (
    <div style={pageWrap}>
      {/* Page Header */}
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><Wallet size={20} color="#F37920" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Affiliate Payout Cycles</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Manage payout cycles — finalise, disburse, and track affiliate commissions
            </p>
          </div>
        </div>
        <button type="button" onClick={load} style={btnRefresh}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        <SummaryCard label="Total Cycles" value={cycles.length} icon={Wallet} color="#F37920" />
        <SummaryCard label="Open" value={openCount} icon={Clock} color="#2563EB" />
        <SummaryCard label="Finalised" value={finalisedCount} icon={AlertTriangle} color="#D97706" />
        <SummaryCard label="Disbursed" value={disbursedCount} icon={CheckCircle2} color="#16A34A" />
      </div>

      {/* Create + Year filter */}
      <div style={toolbarCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Year</label>
          <select style={inputSm} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <form onSubmit={createCycle} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" style={inputSm} value={newPeriodEnd} onChange={(e) => setNewPeriodEnd(e.target.value)} placeholder="Period end date" />
          <button type="submit" disabled={creating || !newPeriodEnd} style={btnSmPrimary}>
            <Plus size={12} /> {creating ? 'Creating...' : 'New Cycle'}
          </button>
        </form>
      </div>

      {err && <div style={errorBanner}>{err}</div>}

      {/* Cycles list */}
      <div style={listCard}>
        {loading && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Loading cycles...</div>}
        {!loading && cycles.length === 0 && <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>No payout cycles found for {year}.</div>}
        {!loading && cycles.map((c) => (
          <div key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
            <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} style={cycleRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <StatusBadge status={c.status} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B' }}>
                    {c.period_start} — {c.period_end}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Cycle #{c.id} · {c.cycle_anchor}</div>
                </div>
              </div>
              {expanded === c.id ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
            </button>
            {expanded === c.id && <CycleDetailPanel cycle={c} onAction={load} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const pageWrap = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const headerCard = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', flexWrap: 'wrap', gap: 12 };
const iconWrap = { width: 44, height: 44, borderRadius: 12, background: '#FEF0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const toolbarCard = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px 20px', borderRadius: 12, border: '1px solid #E6E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', flexWrap: 'wrap', gap: 10 };
const listCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' };
const cycleRow = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' };
const errorBanner = { background: '#FEE2E2', color: '#991B1B', borderRadius: 10, padding: '10px 16px', fontSize: 13 };
const btnRefresh = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const btnAction = { padding: '7px 14px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(243,121,32,0.2)' };
const btnSmPrimary = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#F37920', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const btnSmGhost = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 500, fontSize: 11, cursor: 'pointer' };
const inputSm = { padding: '7px 10px', borderRadius: 8, border: '1px solid #E6E8F0', fontSize: 12, boxSizing: 'border-box' };
const thSm = { textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600, fontSize: 10, borderBottom: '1px solid #E6E8F0', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdSm = { padding: '8px 10px', color: '#334155', borderBottom: '1px solid #F8FAFC' };
