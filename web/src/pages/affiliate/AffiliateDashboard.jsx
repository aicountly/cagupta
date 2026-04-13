import { useState, useEffect } from 'react';
import AffiliateLayout from '../../components/layout/AffiliateLayout';
import { getAffiliateDashboard } from '../../services/affiliatePortalService';

export default function AffiliateDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getAffiliateDashboard().then(setData).catch((e) => setErr(e.message || 'Failed to load'));
  }, []);

  return (
    <AffiliateLayout title="Dashboard">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      {!data && !err && <div style={{ color: '#64748b' }}>Loading…</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {[
            ['Services linked', data.services_total],
            ['YTD commission (₹)', Number(data.ytd_commission_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })],
            ['Available balance (₹)', Number(data.available_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })],
            ['Pending payout requests', data.pending_payouts],
            ['Primary bank KYC', data.primary_bank_status || 'none'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </AffiliateLayout>
  );
}
