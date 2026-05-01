import { useState, useEffect } from 'react';
import PartnerLayout from '../components/PartnerLayout';
import { getPartnerDashboard } from '../services/partnerPortalService';

export default function PartnerDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getPartnerDashboard().then(setData).catch((e) => setErr(e.message || 'Failed to load'));
  }, []);

  return (
    <PartnerLayout title="Dashboard">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      {!data && !err && <div style={{ color: '#64748b' }}>Loading…</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {[
            ['Active assignments', data.assignments_active],
            ['Completed', data.assignments_completed],
            ['Total assignments', data.assignments_total],
            ['Total earned (₹)', Number(data.total_earned || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })],
            ['Available balance (₹)', Number(data.available_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })],
            ['Pending payouts', data.pending_payouts],
            ['Primary bank KYC', data.primary_bank_status || 'none'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </PartnerLayout>
  );
}
