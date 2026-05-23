import { useState, useEffect, useCallback } from 'react';
import { Handshake, Users, ShieldCheck, Wallet, Search, UserPlus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getAffiliatesAdmin, approveAffiliate, suspendAffiliate,
  getCommissionDefaults, putCommissionDefaults,
  getPayoutRequestsAdmin, patchPayoutRequest,
} from '../services/affiliateAdminService';

const TABS = [
  { key: 'pending', label: 'Pending', icon: Users },
  { key: 'all', label: 'All Affiliates', icon: Handshake },
  { key: 'outreach', label: 'Outreach Pipeline', icon: UserPlus },
  { key: 'defaults', label: 'Commission Defaults', icon: Wallet },
  { key: 'payouts', label: 'Payouts', icon: Wallet },
];

function KycBadge({ status }) {
  const cfg = {
    verified: { bg: '#DCFCE7', color: '#166534', label: 'KYC Verified' },
    pending: { bg: '#FEF3C7', color: '#92400E', label: 'KYC Pending' },
    missing: { bg: '#FEE2E2', color: '#991B1B', label: 'KYC Missing' },
  };
  const c = cfg[status] || cfg.missing;
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: c.bg, color: c.color }}>{c.label}</span>;
}

function StatusBadge({ status }) {
  const map = {
    pending: { bg: '#FEF3C7', color: '#92400E' },
    approved: { bg: '#DCFCE7', color: '#166534' },
    suspended: { bg: '#FEE2E2', color: '#991B1B' },
  };
  const c = map[status] || map.pending;
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: c.bg, color: c.color, textTransform: 'capitalize' }}>{status}</span>;
}

function OutreachPipeline() {
  const STAGES = ['new', 'contacted', 'interested', 'converted'];
  const [prospects, setProspects] = useState([]);

  useEffect(() => {
    setProspects([]);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {STAGES.map((stage) => {
          const count = prospects.filter((p) => p.stage === stage).length;
          return (
            <div key={stage} style={{ background: '#FAFBFD', border: '1px solid #E6E8F0', borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 100 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1F3B' }}>{count}</div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{stage}</div>
            </div>
          );
        })}
      </div>
      {prospects.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
          <UserPlus size={32} color="#E2E8F0" style={{ marginBottom: 8 }} />
          <div>No outreach prospects yet. Add prospects via the API to track outreach pipeline.</div>
        </div>
      )}
      {prospects.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Email</th><th style={thStyle}>Stage</th><th style={thStyle}>Last Contact</th><th style={thStyle}>Actions</th></tr></thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id}>
                  <td style={tdStyle}>{p.name}</td>
                  <td style={tdStyle}>{p.email}</td>
                  <td style={tdStyle}><span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: 12 }}>{p.stage}</span></td>
                  <td style={tdStyle}>{p.last_contact_at || '—'}</td>
                  <td style={tdStyle}><button type="button" style={btnSmGhost}>Update</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminAffiliates() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState([]);
  const [defaults, setDefaults] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  const loadList = useCallback(() => {
    const st = tab === 'pending' ? 'pending' : 'all';
    getAffiliatesAdmin({ status: st, perPage: 100 })
      .then(setList)
      .catch((e) => setErr(e.message));
  }, [tab]);

  useEffect(() => {
    if (tab === 'pending' || tab === 'all') loadList();
  }, [tab, loadList]);

  useEffect(() => {
    if (tab === 'defaults') getCommissionDefaults().then(setDefaults).catch(() => setDefaults(null));
    if (tab === 'payouts') getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts).catch(() => setPayouts([]));
  }, [tab]);

  const filteredList = list.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
  });

  return (
    <div style={pageWrap}>
      {/* Header */}
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><Handshake size={20} color="var(--portal-primary)" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Affiliates</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Manage affiliate members, outreach pipeline, commissions, and payouts
            </p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/finance/affiliate-payout-cycles')} style={btnSecondary}>
          View Payout Cycles →
        </button>
      </div>

      {/* Tabs */}
      <div style={toolbarCard}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); setErr(''); }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', borderRadius: 8, border: '1px solid',
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
              background: active ? 'var(--portal-primary)' : '#fff',
              color: active ? '#fff' : '#475569',
              borderColor: active ? 'var(--portal-primary)' : '#E6E8F0',
            }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {err && <div style={errorBanner}>{err}</div>}

      {/* Content */}
      <div style={contentCard}>
        {(tab === 'pending' || tab === 'all') && (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input type="text" placeholder="Search affiliates..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 32 }} />
              </div>
              <button type="button" onClick={loadList} style={btnSmGhost}><RefreshCw size={12} /> Refresh</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>KYC</th>
                    <th style={thStyle}>Payout Eligible</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((row) => (
                    <tr key={row.user_id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                      <td style={tdStyle}><strong>{row.name}</strong></td>
                      <td style={tdStyle}>{row.email}</td>
                      <td style={tdStyle}><StatusBadge status={row.status} /></td>
                      <td style={tdStyle}><KycBadge status={row.kyc_status || (row.status === 'approved' ? 'verified' : 'pending')} /></td>
                      <td style={tdStyle}>
                        {row.status === 'approved' && row.kyc_status !== 'missing'
                          ? <span style={{ color: '#16A34A', fontWeight: 600, fontSize: 12 }}>Eligible</span>
                          : <span style={{ color: '#DC2626', fontWeight: 600, fontSize: 12 }}>Not Eligible</span>
                        }
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {row.status === 'pending' && (
                            <button type="button" style={btnApprove} onClick={() => approveAffiliate(row.user_id).then(loadList)}>Approve</button>
                          )}
                          {row.status === 'approved' && (
                            <button type="button" style={btnDanger} onClick={() => suspendAffiliate(row.user_id).then(loadList)}>Suspend</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredList.length === 0 && (
                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>No affiliates found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'outreach' && (
          <div style={{ padding: 20 }}>
            <OutreachPipeline />
          </div>
        )}

        {tab === 'defaults' && defaults && (
          <div style={{ padding: 20 }}>
            <DefaultsForm defaults={defaults} onSaved={(d) => setDefaults(d)} />
          </div>
        )}

        {tab === 'payouts' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Affiliate</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td style={tdStyle}>{p.id}</td>
                    <td style={tdStyle}>{p.affiliate_name} <span style={{ color: '#94a3b8', fontSize: 11 }}>{p.affiliate_email}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>₹{Number(p.requested_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style={tdStyle}><StatusBadge status={p.status} /></td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.status === 'pending' && (
                          <>
                            <button type="button" style={btnApprove} onClick={() => patchPayoutRequest(p.id, { status: 'approved' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Approve</button>
                            <button type="button" style={btnDanger} onClick={() => patchPayoutRequest(p.id, { status: 'rejected' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Reject</button>
                            <button type="button" style={btnSmGhost} onClick={() => patchPayoutRequest(p.id, { status: 'paid' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Mark Paid</button>
                          </>
                        )}
                        {p.status === 'approved' && (
                          <button type="button" style={btnSmGhost} onClick={() => patchPayoutRequest(p.id, { status: 'paid' }).then(() => getPayoutRequestsAdmin({ perPage: 100 }).then(setPayouts))}>Mark Paid</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>No payout requests.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DefaultsForm({ defaults, onSaved }) {
  const [f, setF] = useState(defaults);
  useEffect(() => { setF(defaults); }, [defaults]);
  if (!f) return null;
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const fields = [
    ['referral_year1_pct', 'Referral Year 1 %'],
    ['referral_year2_pct', 'Referral Year 2 %'],
    ['referral_year3_plus_pct', 'Referral Year 3+ %'],
    ['direct_affiliate_pct', 'Direct Mode — Affiliate %'],
    ['direct_firm_pct', 'Direct Mode — Firm %'],
    ['upline_sub_threshold_amount', 'Sub Threshold (₹ per block)'],
    ['upline_sub_bonus_amount', 'Upline Bonus (₹ per block)'],
  ];
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {fields.map(([key, label]) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <input type="number" step="0.01" value={f[key] ?? ''} onChange={(e) => set(key, e.target.value)} style={inputStyle} />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => putCommissionDefaults({
          referral_year1_pct: parseFloat(f.referral_year1_pct),
          referral_year2_pct: parseFloat(f.referral_year2_pct),
          referral_year3_plus_pct: parseFloat(f.referral_year3_plus_pct),
          direct_affiliate_pct: parseFloat(f.direct_affiliate_pct),
          direct_firm_pct: parseFloat(f.direct_firm_pct),
          upline_sub_threshold_amount: parseFloat(f.upline_sub_threshold_amount),
          upline_sub_bonus_amount: parseFloat(f.upline_sub_bonus_amount),
        }).then(onSaved)}
        style={btnPrimary}
      >
        Save Defaults
      </button>
    </div>
  );
}

const pageWrap = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--portal-bg)', minHeight: '100%' };
const headerCard = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 24px', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', flexWrap: 'wrap', gap: 12 };
const iconWrap = { width: 44, height: 44, borderRadius: 12, background: 'var(--portal-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const toolbarCard = { display: 'flex', gap: 8, background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid #E6E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', flexWrap: 'wrap' };
const contentCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' };
const errorBanner = { background: '#FEE2E2', color: '#991B1B', borderRadius: 10, padding: '10px 16px', fontSize: 13 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #E6E8F0', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#FAFBFD' };
const tdStyle = { padding: '10px 14px', color: '#334155', borderBottom: '1px solid #F8FAFC' };
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E6E8F0', fontSize: 13, boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };
const btnPrimary = { marginTop: 16, padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--portal-primary)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(var(--portal-primary-rgb),0.2)' };
const btnSecondary = { padding: '8px 14px', borderRadius: 8, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const btnApprove = { padding: '5px 10px', borderRadius: 6, border: 'none', background: '#16A34A', color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer' };
const btnDanger = { padding: '5px 10px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 600, fontSize: 11, cursor: 'pointer' };
const btnSmGhost = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 500, fontSize: 11, cursor: 'pointer' };
