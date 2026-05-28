import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { ROLES } from '../../../constants/roles';
import DateInput from '../../../components/common/DateInput';
import { getInvoiceCostVarianceReport } from '../services/txnService';

const card = {
  background: '#fff',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  marginBottom: 20,
};
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 };
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 };
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td = { padding: '10px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#334155' };

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceCostVarianceReport() {
  const { session } = useAuth();
  const role = String(session?.user?.role || '').toLowerCase();
  const email = String(session?.user?.email || '').toLowerCase();
  const allowed = role === ROLES.SUPER_ADMIN || role === ROLES.ACCOUNTS || email === 'rahul@cagupta.in';

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!allowed) return;
    setLoading(true);
    setErr('');
    getInvoiceCostVarianceReport({ dateFrom, dateTo })
      .then(setRows)
      .catch((e) => {
        setErr(e.message || 'Failed to load report');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [allowed, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  if (!allowed) {
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Invoice cost variance</h1>
        <p style={{ color: '#64748b' }}>This report is available to Accounts and Super Admin only.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Invoice cost variance</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Invoices where taxable professional fees for the linked engagement type were below Standard Fees and/or below calculated value from timesheets at team planned ₹/hr.
      </p>

      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <label style={label}>
          From
          <DateInput style={{ ...input, minWidth: 160 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label style={label}>
          To
          <DateInput style={{ ...input, minWidth: 160 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {err && (
        <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 16 }}>
          {err}
        </div>
      )}

      <div style={card}>
        {!loading && rows.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 14 }}>No variance rows for this period.</div>
        )}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Invoice</th>
                  <th style={th}>Client</th>
                  <th style={th}>Service</th>
                  <th style={th}>Matching fees</th>
                  <th style={th}>Std fees</th>
                  <th style={th}>Hours-based</th>
                  <th style={th}>Δ vs std</th>
                  <th style={th}>Δ vs calc</th>
                  <th style={th}>Flags</th>
                  <th style={th}>Ack</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.txn_id}>
                    <td style={td}>{r.txn_date}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{r.invoice_number}</td>
                    <td style={td}>{r.client_name}</td>
                    <td style={td}>{r.service_id != null ? `#${r.service_id}` : '—'}</td>
                    <td style={td}>{fmtMoney(r.matching_professional_subtotal)}</td>
                    <td style={td}>{fmtMoney(r.standard_fees)}</td>
                    <td style={td}>{fmtMoney(r.calculated_hours_fees)}</td>
                    <td style={td}>{fmtMoney(r.diff_vs_standard)}</td>
                    <td style={td}>{fmtMoney(r.diff_vs_calculated)}</td>
                    <td style={td}>
                      {r.below_both ? 'Below both' : ''}
                      {!r.below_both && r.below_standard_fees ? 'Below std' : ''}
                      {!r.below_both && !r.below_standard_fees && r.below_calculated_hours_fees ? 'Below calc' : ''}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: '#64748b' }}>
                      {r.accounts_ack_at ? String(r.accounts_ack_at).slice(0, 16) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
