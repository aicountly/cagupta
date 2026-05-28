import { useEffect, useState } from 'react';
import AssociateLayout from '../components/AssociateLayout';
import { getAssociateRewards, postAssociateRedeem } from '../services/associatePortalService';

export default function AssociateRewards() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [pts, setPts] = useState('');
  const [catalogKey, setCatalogKey] = useState('amazon_voucher');

  const load = () => getAssociateRewards().then(setData).catch((e) => setErr(e.message || 'Failed'));

  useEffect(() => { load(); }, []);

  const submit = () => {
    setErr('');
    postAssociateRedeem({ catalog_key: catalogKey, points: parseInt(pts, 10) || 0 })
      .then(() => { setPts(''); load(); })
      .catch((e) => setErr(e.message));
  };

  return (
    <AssociateLayout title="Rewards">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      {!data && !err && <div style={{ color: '#64748b' }}>Loading…</div>}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Points balance</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{data.balance_points}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>₹1 per point at redemption</div>
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Request redemption</div>
            <select value={catalogKey} onChange={(e) => setCatalogKey(e.target.value)} style={{ marginRight: 8, padding: 8, borderRadius: 8 }}>
              {(data.catalog || []).map((c) => <option key={c.catalog_key} value={c.catalog_key}>{c.label}</option>)}
            </select>
            <input type="number" min="1" value={pts} onChange={(e) => setPts(e.target.value)} placeholder="Points" style={{ padding: 8, borderRadius: 8, width: 120 }} />
            <button type="button" onClick={submit} style={{ marginLeft: 8, padding: '8px 14px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Submit</button>
          </div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Statement</div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', maxHeight: 360, overflowY: 'auto' }}>
            {(data.ledger || []).map((row) => (
              <div key={row.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <strong>{row.delta_points > 0 ? '+' : ''}{row.delta_points}</strong> · {row.label || row.kind} · {row.created_at}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontWeight: 700 }}>Requests</div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            {(data.redemptions || []).map((r) => (
              <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                {r.catalog_key} · {r.points} pts · <strong>{r.status}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </AssociateLayout>
  );
}
