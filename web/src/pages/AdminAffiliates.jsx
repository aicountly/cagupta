import { useState, useEffect } from 'react';
import {
  getAffiliatesAdmin, approveAffiliate, suspendAffiliate,
  getCommissionDefaults, putCommissionDefaults,
  getPayoutRequestsAdmin, patchPayoutRequest,
} from '../services/affiliateAdminService';

export default function AdminAffiliates() {
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState([]);
  const [defaults, setDefaults] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [err, setErr] = useState('');

  function loadList() {
    const st = tab === 'pending' ? 'pending' : tab === 'all' ? 'all' : 'approved';
    getAffiliatesAdmin({ status: st, perPage: 100 }).then(setList).catch((e) => setErr(e.message));
  }

  useEffect(() => { loadList(); }, [tab]);

  useEffect(() => {
    if (tab === 'defaults') {
      getCommissionDefaults().then(setDefaults).catch(() => setDefaults(null));
    }
    if (tab === 'payouts') {
      getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts).catch(() => setPayouts([]));
    }
  }, [tab]);

  const tabBtn = (id, label) => (
    <button
      type="button"
      key={id}
      onClick={() => { setTab(id); setErr(''); }}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: tab === id ? '2px solid #2563eb' : '1px solid #e2e8f0',
        background: tab === id ? '#eff6ff' : '#fff',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Affiliates</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>Approve partners, firm commission defaults, and payout requests.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabBtn('pending', 'Pending')}
        {tabBtn('all', 'All')}
        {tabBtn('defaults', 'Commission defaults')}
        {tabBtn('payouts', 'Payouts')}
      </div>
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}

      {(tab === 'pending' || tab === 'all') && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>User</th>
                <th style={{ padding: 10 }}>Email</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.user_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 10 }}>{row.name}</td>
                  <td style={{ padding: 10 }}>{row.email}</td>
                  <td style={{ padding: 10 }}>{row.status}</td>
                  <td style={{ padding: 10 }}>
                    {row.status === 'pending' && (
                      <button type="button" style={{ marginRight: 8, padding: '4px 10px', cursor: 'pointer' }} onClick={() => approveAffiliate(row.user_id).then(loadList)}>Approve</button>
                    )}
                    {row.status === 'approved' && (
                      <button type="button" style={{ padding: '4px 10px', cursor: 'pointer' }} onClick={() => suspendAffiliate(row.user_id).then(loadList)}>Suspend</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <div style={{ padding: 20, color: '#64748b' }}>No rows.</div>}
        </div>
      )}

      {tab === 'defaults' && defaults && (
        <DefaultsForm defaults={defaults} onSaved={(d) => setDefaults(d)} />
      )}

      {tab === 'payouts' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>ID</th>
                <th style={{ padding: 10 }}>Affiliate</th>
                <th style={{ padding: 10 }}>Amount</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }} />
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 10 }}>{p.id}</td>
                  <td style={{ padding: 10 }}>{p.affiliate_name} <span style={{ color: '#94a3b8' }}>{p.affiliate_email}</span></td>
                  <td style={{ padding: 10 }}>₹{Number(p.requested_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: 10 }}>{p.status}</td>
                  <td style={{ padding: 10 }}>
                    {p.status === 'pending' && (
                      <>
                        <button type="button" style={{ marginRight: 6, fontSize: 11, cursor: 'pointer' }} onClick={() => patchPayoutRequest(p.id, { status: 'approved' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Approve</button>
                        <button type="button" style={{ marginRight: 6, fontSize: 11, cursor: 'pointer' }} onClick={() => patchPayoutRequest(p.id, { status: 'rejected' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Reject</button>
                        <button type="button" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => patchPayoutRequest(p.id, { status: 'paid' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Mark paid</button>
                      </>
                    )}
                    {p.status === 'approved' && (
                      <button type="button" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => patchPayoutRequest(p.id, { status: 'paid' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DefaultsForm({ defaults, onSaved }) {
  const [f, setF] = useState(defaults);
  useEffect(() => { setF(defaults); }, [defaults]);
  if (!f) return null;
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', maxWidth: 440 }}>
      {[
        ['referral_year1_pct', 'Referral year 1 %'],
        ['referral_year2_pct', 'Referral year 2 %'],
        ['referral_year3_plus_pct', 'Referral year 3+ %'],
        ['direct_affiliate_pct', 'Direct mode — affiliate %'],
        ['direct_firm_pct', 'Direct mode — firm %'],
        ['upline_sub_threshold_amount', 'Sub threshold (₹ per block)'],
        ['upline_sub_bonus_amount', 'Upline bonus (₹ per block)'],
      ].map(([key, label]) => (
        <label key={key} style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
          {label}
          <input
            type="number"
            step="0.01"
            value={f[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
        </label>
      ))}
      <button
        type="button"
        onClick={() => putCommissionDefaults({
          referral_year1_pct: parseFloat(f.referral_year1_pct, 10),
          referral_year2_pct: parseFloat(f.referral_year2_pct, 10),
          referral_year3_plus_pct: parseFloat(f.referral_year3_plus_pct, 10),
          direct_affiliate_pct: parseFloat(f.direct_affiliate_pct, 10),
          direct_firm_pct: parseFloat(f.direct_firm_pct, 10),
          upline_sub_threshold_amount: parseFloat(f.upline_sub_threshold_amount, 10),
          upline_sub_bonus_amount: parseFloat(f.upline_sub_bonus_amount, 10),
        }).then(onSaved)}
        style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
      >
        Save defaults
      </button>
    </div>
  );
}
