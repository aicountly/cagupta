import { useState, useEffect } from 'react';
import AffiliateLayout from '../../components/layout/AffiliateLayout';
import { getAffiliateServices } from '../../services/affiliatePortalService';

export default function AffiliateServices() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    getAffiliateServices({ perPage: 100 }).then((r) => setRows(r.rows)).catch((e) => setErr(e.message || 'Failed'));
  }, []);

  return (
    <AffiliateLayout title="My services">
      {err && <div style={{ color: '#dc2626' }}>{err}</div>}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>ID</th>
              <th style={{ padding: 10 }}>Client</th>
              <th style={{ padding: 10 }}>Type</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Commission mode</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10 }}>{s.id}</td>
                <td style={{ padding: 10 }}>{s.client_display || '—'}</td>
                <td style={{ padding: 10 }}>{s.service_type}</td>
                <td style={{ padding: 10 }}>{s.status}</td>
                <td style={{ padding: 10 }}>{s.commission_mode || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err && <div style={{ padding: 24, color: '#64748b' }}>No linked engagements.</div>}
      </div>
    </AffiliateLayout>
  );
}
