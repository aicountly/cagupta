import { useState, useEffect } from 'react';
import AffiliateLayout from '../../components/layout/AffiliateLayout';
import { getAffiliateCommissions } from '../../services/affiliatePortalService';

export default function AffiliateCommissions() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');

  function load() {
    setErr('');
    getAffiliateCommissions({ dateFrom: from || undefined, dateTo: to || undefined, perPage: 100 })
      .then((r) => { setRows(r.rows); setMeta(r.meta || {}); })
      .catch((e) => setErr(e.message || 'Failed'));
  }

  useEffect(() => { load(); }, []);

  return (
    <AffiliateLayout title="Commissions & statements">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12 }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        </label>
        <label style={{ fontSize: 12 }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        </label>
        <button type="button" onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          Apply
        </button>
      </div>
      {meta.pagination?.period_total != null && (
        <div style={{ marginBottom: 12, fontWeight: 700 }}>
          Period total (accrued): ₹{Number(meta.pagination.period_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      )}
      {err && <div style={{ color: '#dc2626', marginBottom: 8 }}>{err}</div>}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>Date</th>
              <th style={{ padding: 10 }}>Type</th>
              <th style={{ padding: 10 }}>Invoice</th>
              <th style={{ padding: 10 }}>Amount (₹)</th>
              <th style={{ padding: 10 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10 }}>{r.accrual_date}</td>
                <td style={{ padding: 10 }}>{r.accrual_type}</td>
                <td style={{ padding: 10 }}>{r.invoice_number || r.invoice_txn_id || '—'}</td>
                <td style={{ padding: 10 }}>{Number(r.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: 10 }}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err && <div style={{ padding: 24, color: '#64748b' }}>No rows.</div>}
      </div>
    </AffiliateLayout>
  );
}
