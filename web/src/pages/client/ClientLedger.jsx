import { useEffect, useState } from 'react';
import ClientLayout from '../../components/layout/ClientLayout';
import { getClientLedger, getClientMe } from '../../services/clientPortalService';

export default function ClientLedger() {
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  const [orgId, setOrgId] = useState('');
  const [ledgerClass, setLedgerClass] = useState('regular');
  const [ledgerView, setLedgerView] = useState('consolidated');

  useEffect(() => {
    getClientMe().then(setMe).catch((e) => setErr(e.message || 'Failed'));
  }, []);

  useEffect(() => {
    setErr('');
    getClientLedger({
      organizationId: orgId || undefined,
      ledgerClass,
      ledgerView,
    })
      .then(setRows)
      .catch((e) => setErr(e.message || 'Failed'));
  }, [orgId, ledgerClass, ledgerView]);

  return (
    <ClientLayout title="Ledger">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <label htmlFor="client-ledger-class" style={{ fontSize: 12, color: '#475569', marginRight: 8 }}>Ledger:</label>
          <select
            id="client-ledger-class"
            value={ledgerClass}
            onChange={(e) => setLedgerClass(e.target.value)}
            style={{ padding: 8, borderRadius: 8 }}
          >
            <option value="regular">Regular</option>
            <option value="memorandum">Memorandum</option>
          </select>
        </div>
        <div>
          <label htmlFor="client-ledger-view" style={{ fontSize: 12, color: '#475569', marginRight: 8 }}>View:</label>
          <select
            id="client-ledger-view"
            value={ledgerView}
            onChange={(e) => setLedgerView(e.target.value)}
            style={{ padding: 8, borderRadius: 8 }}
          >
            <option value="consolidated">Consolidated</option>
            <option value="fees">Fees</option>
            <option value="reimbursement">Reimbursement</option>
          </select>
        </div>
        {me?.available_organizations?.length > 0 && (
          <div>
            <label htmlFor="client-org" style={{ fontSize: 12, color: '#475569', marginRight: 8 }}>Organization:</label>
            <select id="client-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              <option value="">My contact ledger</option>
              {me.available_organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: 10 }}>Date</th>
              <th style={{ padding: 10 }}>Narration</th>
              <th style={{ padding: 10 }}>Debit</th>
              <th style={{ padding: 10 }}>Credit</th>
              <th style={{ padding: 10 }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.id ?? 'row'}-${i}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10 }}>{r.date || '-'}</td>
                <td style={{ padding: 10 }}>{r.narration || '-'}</td>
                <td style={{ padding: 10 }}>{Number(r.debit || 0).toFixed(2)}</td>
                <td style={{ padding: 10 }}>{Number(r.credit || 0).toFixed(2)}</td>
                <td style={{ padding: 10 }}>{Number(r.balance || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err && <div style={{ padding: 24, color: '#64748b' }}>No ledger entries found.</div>}
      </div>
    </ClientLayout>
  );
}
