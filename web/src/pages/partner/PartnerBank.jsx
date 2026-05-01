import { useState, useEffect, useCallback } from 'react';
import PartnerLayout from '../../components/layout/PartnerLayout';
import { getPartnerBankList, postPartnerBank } from '../../services/partnerPortalService';

const VER_COLORS = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  verified: { bg: '#dcfce7', color: '#166534' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
};

export default function PartnerBank() {
  const [banks, setBanks] = useState([]);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ account_holder_name: '', bank_name: '', account_number: '', ifsc: '', is_primary: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setErr('');
    getPartnerBankList().then(setBanks).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await postPartnerBank(form);
      setShowForm(false);
      setForm({ account_holder_name: '', bank_name: '', account_number: '', ifsc: '', is_primary: false });
      load();
    } catch (ex) {
      setErr(ex.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PartnerLayout title="Bank / KYC">
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Bank accounts</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: '#ea580c', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ Add account'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
          {[
            ['Account holder name', 'account_holder_name', 'text'],
            ['Bank name', 'bank_name', 'text'],
            ['Account number', 'account_number', 'text'],
            ['IFSC code', 'ifsc', 'text'],
          ].map(([label, key, type]) => (
            <div key={key}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                required={key !== 'bank_name'}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} />
            Set as primary account
          </label>
          <button type="submit" disabled={saving} style={{
            padding: '10px 0', background: '#ea580c', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {banks.length === 0 && <div style={{ color: '#94a3b8' }}>No bank accounts added yet.</div>}
        {banks.map((b) => {
          const vc = VER_COLORS[b.verification_status] || VER_COLORS.pending;
          return (
            <div key={b.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{b.account_holder_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {b.bank_name ? `${b.bank_name} · ` : ''}****{b.account_number_last4} · {b.ifsc}
                    {b.is_primary ? ' · Primary' : ''}
                  </div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: vc.bg, color: vc.color }}>
                  {b.verification_status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </PartnerLayout>
  );
}
