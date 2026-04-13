import { useState, useEffect } from 'react';
import AffiliateLayout from '../../components/layout/AffiliateLayout';
import { getAffiliatePayoutRequests, postAffiliatePayoutRequest, getAffiliateDashboard } from '../../services/affiliatePortalService';

export default function AffiliatePayouts() {
  const [rows, setRows] = useState([]);
  const [avail, setAvail] = useState(0);
  const [maxAmount, setMaxAmount] = useState('');
  const [fast, setFast] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function refresh() {
    getAffiliatePayoutRequests().then(setRows).catch(() => setRows([]));
    getAffiliateDashboard().then((d) => setAvail(Number(d.available_balance || 0))).catch(() => {});
  }

  useEffect(() => { refresh(); }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const n = parseFloat(maxAmount, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Enter a valid amount.');
      return;
    }
    try {
      const res = await postAffiliatePayoutRequest({ max_amount: n, fast_track: fast });
      setMsg(`Request submitted. Allocated ₹${res.allocated_amount}.`);
      setMaxAmount('');
      refresh();
    } catch (ex) {
      setErr(ex.message || 'Request failed');
    }
  }

  return (
    <AffiliateLayout title="Payout requests">
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 16 }}>
        <div style={{ fontSize: 14, marginBottom: 12 }}>Available balance: <strong>₹{avail.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
        <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Max amount to withdraw"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', width: 200 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />
            Fast track
          </label>
          <button type="submit" style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Request payout
          </button>
        </form>
        {msg && <div style={{ color: '#16a34a', marginTop: 10, fontSize: 13 }}>{msg}</div>}
        {err && <div style={{ color: '#dc2626', marginTop: 10, fontSize: 13 }}>{err}</div>}
        <p style={{ fontSize: 11, color: '#64748b', marginTop: 10, marginBottom: 0 }}>
          We allocate open commission lines (FIFO) up to your limit. Amount may be less than requested if lines do not match exactly.
        </p>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>Date</th>
              <th style={{ padding: 10 }}>Amount</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Fast</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10 }}>{r.created_at?.slice(0, 10)}</td>
                <td style={{ padding: 10 }}>₹{Number(r.requested_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: 10 }}>{r.status}</td>
                <td style={{ padding: 10 }}>{r.fast_track ? 'Yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AffiliateLayout>
  );
}
