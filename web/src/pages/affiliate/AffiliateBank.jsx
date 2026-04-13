import { useState, useEffect } from 'react';
import AffiliateLayout from '../../components/layout/AffiliateLayout';
import { getAffiliateBankList, postAffiliateBank } from '../../services/affiliatePortalService';

export default function AffiliateBank() {
  const [rows, setRows] = useState([]);
  const [holder, setHolder] = useState('');
  const [bank, setBank] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [num, setNum] = useState('');
  const [primary, setPrimary] = useState(true);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  function load() {
    getAffiliateBankList().then(setRows).catch(() => setRows([]));
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    try {
      await postAffiliateBank({
        account_holder_name: holder,
        bank_name: bank,
        ifsc,
        account_number: num,
        is_primary: primary,
      });
      setOk('Saved.');
      setHolder(''); setBank(''); setIfsc(''); setNum('');
      load();
    } catch (ex) {
      setErr(ex.message || 'Failed');
    }
  }

  return (
    <AffiliateLayout title="Bank details (KYC)">
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 20, maxWidth: 480 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Add bank account</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input required placeholder="Account holder name" value={holder} onChange={(e) => setHolder(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <input placeholder="Bank name" value={bank} onChange={(e) => setBank(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <input required placeholder="IFSC" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <input required placeholder="Account number" value={num} onChange={(e) => setNum(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
            Set as primary
          </label>
          <button type="submit" style={{ padding: 12, borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save</button>
        </form>
        {ok && <div style={{ color: '#16a34a', marginTop: 8 }}>{ok}</div>}
        {err && <div style={{ color: '#dc2626', marginTop: 8 }}>{err}</div>}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Saved accounts</div>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding: 12, borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
            <strong>{r.account_holder_name}</strong> · ****{r.account_number_last4} · {r.ifsc}
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {r.verification_status}{r.is_primary ? ' · primary' : ''}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: 16, color: '#64748b' }}>No bank details yet.</div>}
      </div>
    </AffiliateLayout>
  );
}
