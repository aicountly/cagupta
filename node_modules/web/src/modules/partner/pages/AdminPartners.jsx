import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Users, ShieldCheck, Wallet, Search, Plus, RefreshCw, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getPartners, createPartner, approvePartner, suspendPartner,
  getPartnerAssignments, getPartnerPayoutRequests, updatePartnerPayoutRequest,
} from '../services/partnerAdminService';

const TABS = [
  { key: 'pending', label: 'Pending', icon: Users },
  { key: 'all', label: 'All Partners', icon: Briefcase },
  { key: 'assignments', label: 'Assignments', icon: ClipboardList },
  { key: 'payouts', label: 'Payouts', icon: Wallet },
  { key: 'create', label: 'Create Partner', icon: Plus },
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
    paid: { bg: '#DBEAFE', color: '#1E40AF' },
    rejected: { bg: '#FEE2E2', color: '#991B1B' },
  };
  const c = map[status] || map.pending;
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: c.bg, color: c.color, textTransform: 'capitalize' }}>{status}</span>;
}

export default function AdminPartners() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  const loadList = useCallback(() => {
    const st = tab === 'all' ? undefined : tab;
    if (tab === 'pending' || tab === 'approved' || tab === 'all') {
      getPartners({ status: st === 'all' ? undefined : st, perPage: 100 })
        .then(setList)
        .catch((e) => setErr(e.message));
    }
  }, [tab]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (tab === 'assignments') getPartnerAssignments({ perPage: 100 }).then(setAssignments).catch(() => setAssignments([]));
    if (tab === 'payouts') getPartnerPayoutRequests().then(setPayouts).catch(() => setPayouts([]));
  }, [tab]);

  async function handleApprove(userId) {
    try { await approvePartner(userId); loadList(); } catch (e) { setErr(e.message); }
  }
  async function handleSuspend(userId) {
    try { await suspendPartner(userId); loadList(); } catch (e) { setErr(e.message); }
  }
  async function handlePayoutAction(id, status) {
    try { await updatePartnerPayoutRequest(id, { status }); getPartnerPayoutRequests().then(setPayouts); } catch (e) { setErr(e.message); }
  }

  const filteredList = list.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
  });

  return (
    <div style={pageWrap}>
      <div style={headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={iconWrap}><Briefcase size={20} color="var(--portal-primary)" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Partners</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b' }}>
              Manage partner professionals, assignments, and payouts
            </p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/finance/partner-payout-cycles')} style={btnSecondary}>
          View Payout Cycles →
        </button>
      </div>

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

      <div style={contentCard}>
        {(tab === 'pending' || tab === 'approved' || tab === 'all') && (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input type="text" placeholder="Search partners..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 32 }} />
              </div>
              <button type="button" onClick={loadList} style={btnSmGhost}><RefreshCw size={12} /> Refresh</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Specialty</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>KYC</th>
                    <th style={thStyle}>Payout Eligible</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((p) => (
                    <tr key={p.user_id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                      <td style={tdStyle}><strong>{p.name}</strong></td>
                      <td style={tdStyle}>{p.email}</td>
                      <td style={tdStyle}>{p.specialty || '—'}</td>
                      <td style={tdStyle}><StatusBadge status={p.status} /></td>
                      <td style={tdStyle}><KycBadge status={p.kyc_status || (p.status === 'approved' ? 'verified' : 'pending')} /></td>
                      <td style={tdStyle}>
                        {p.status === 'approved' && p.kyc_status !== 'missing'
                          ? <span style={{ color: '#16A34A', fontWeight: 600, fontSize: 12 }}>Eligible</span>
                          : <span style={{ color: '#DC2626', fontWeight: 600, fontSize: 12 }}>Not Eligible</span>
                        }
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {p.status === 'pending' && <button type="button" style={btnApprove} onClick={() => handleApprove(p.user_id)}>Approve</button>}
                          {p.status === 'approved' && <button type="button" style={btnDanger} onClick={() => handleSuspend(p.user_id)}>Suspend</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredList.length === 0 && <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>No partners found.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'assignments' && (
          <div style={{ padding: 20 }}>
            {assignments.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No assignments yet.</div>}
            {assignments.map((a) => (
              <div key={a.id} style={{ background: '#FAFBFD', border: '1px solid #E6E8F0', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0B1F3B' }}>{a.service_title || `Service #${a.service_id}`}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Partner: <strong>{a.partner_name}</strong> · Status: <StatusBadge status={a.status} />
                  {a.partner_payout_pct ? ` · Payout: ${a.partner_payout_pct}%` : ''}
                  {a.assigned_by_name ? ` · Assigned by ${a.assigned_by_name}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'payouts' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Partner</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td style={tdStyle}>{r.id}</td>
                    <td style={tdStyle}>{r.partner_name}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>₹{Number(r.requested_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style={tdStyle}><StatusBadge status={r.status} /></td>
                    <td style={tdStyle}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {r.status === 'pending' && (
                          <>
                            <button type="button" style={btnApprove} onClick={() => handlePayoutAction(r.id, 'approved')}>Approve</button>
                            <button type="button" style={btnDanger} onClick={() => handlePayoutAction(r.id, 'rejected')}>Reject</button>
                          </>
                        )}
                        {r.status === 'approved' && <button type="button" style={btnSmGhost} onClick={() => handlePayoutAction(r.id, 'paid')}>Mark Paid</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>No payout requests.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'create' && (
          <div style={{ padding: 20 }}>
            <CreatePartnerForm onCreated={() => setTab('pending')} />
          </div>
        )}
      </div>
    </div>
  );
}

function CreatePartnerForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', specialty: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setErr('');
    try { await createPartner(form); onCreated(); }
    catch (ex) { setErr(ex.message || 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {err && <div style={{ color: '#DC2626', fontSize: 13 }}>{err}</div>}
      {[
        ['Name', 'name', 'text', true],
        ['Email', 'email', 'email', true],
        ['Password (min 8)', 'password', 'password', true],
        ['Specialty', 'specialty', 'text', false],
      ].map(([label, key, type, required]) => (
        <div key={key}>
          <label style={labelStyle}>{label}</label>
          <input type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} required={required} style={inputStyle} />
        </div>
      ))}
      <button type="submit" disabled={saving} style={btnPrimary}>
        {saving ? 'Creating...' : 'Create Partner'}
      </button>
    </form>
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
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E6E8F0', fontSize: 13, boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };
const btnPrimary = { padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--portal-primary)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(var(--portal-primary-rgb),0.2)' };
const btnSecondary = { padding: '8px 14px', borderRadius: 8, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const btnApprove = { padding: '5px 10px', borderRadius: 6, border: 'none', background: '#16A34A', color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer' };
const btnDanger = { padding: '5px 10px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 600, fontSize: 11, cursor: 'pointer' };
const btnSmGhost = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #E6E8F0', background: '#fff', color: '#475569', fontWeight: 500, fontSize: 11, cursor: 'pointer' };
