import { useState, useEffect, useCallback } from 'react';
import {
  getPartners, createPartner, approvePartner, suspendPartner,
  getPartnerAssignments, getPartnerPayoutRequests, updatePartnerPayoutRequest,
} from '../services/partnerAdminService';

export default function AdminPartners() {
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [err, setErr] = useState('');

  const loadList = useCallback(() => {
    const st = tab === 'all' ? undefined : tab === 'payouts' ? undefined : tab === 'assignments' ? undefined : tab === 'create' ? undefined : tab;
    if (st !== undefined || tab === 'all') {
      getPartners({ status: tab === 'all' ? undefined : st, perPage: 100 })
        .then(setList)
        .catch((e) => setErr(e.message));
    }
  }, [tab]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (tab === 'assignments') {
      getPartnerAssignments({ perPage: 100 }).then(setAssignments).catch(() => setAssignments([]));
    }
    if (tab === 'payouts') {
      getPartnerPayoutRequests().then(setPayouts).catch(() => setPayouts([]));
    }
  }, [tab]);

  async function handleApprove(userId) {
    try { await approvePartner(userId); loadList(); }
    catch (e) { setErr(e.message); }
  }

  async function handleSuspend(userId) {
    try { await suspendPartner(userId); loadList(); }
    catch (e) { setErr(e.message); }
  }

  async function handlePayoutAction(id, status) {
    try { await updatePartnerPayoutRequest(id, { status }); setTab('payouts'); }
    catch (e) { setErr(e.message); }
  }

  const tabBtn = (key, label) => (
    <button
      type="button"
      onClick={() => { setTab(key); setErr(''); }}
      style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: tab === key ? '2px solid #ea580c' : '1px solid #e2e8f0',
        background: tab === key ? '#fff7ed' : '#fff', color: '#0f172a',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Partners</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>Manage partner professionals, assign work, and process payouts.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabBtn('pending', 'Pending')}
        {tabBtn('approved', 'Approved')}
        {tabBtn('all', 'All')}
        {tabBtn('assignments', 'Assignments')}
        {tabBtn('payouts', 'Payouts')}
        {tabBtn('create', 'Create Partner')}
      </div>
      {err && <div style={{ color: '#dc2626', marginBottom: 12 }}>{err}</div>}

      {(tab === 'pending' || tab === 'approved' || tab === 'all') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.length === 0 && <div style={{ color: '#94a3b8' }}>No partners found.</div>}
          {list.map((p) => (
            <div key={p.user_id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{p.email} · {p.status}{p.specialty ? ` · ${p.specialty}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.status === 'pending' && (
                  <button onClick={() => handleApprove(p.user_id)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    Approve
                  </button>
                )}
                {p.status === 'approved' && (
                  <button onClick={() => handleSuspend(p.user_id)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    Suspend
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'assignments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {assignments.length === 0 && <div style={{ color: '#94a3b8' }}>No assignments yet.</div>}
          {assignments.map((a) => (
            <div key={a.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700 }}>{a.service_title || `Service #${a.service_id}`}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Partner: {a.partner_name} · Status: {a.status}
                {a.partner_payout_pct ? ` · Payout: ${a.partner_payout_pct}%` : ''}
                {a.assigned_by_name ? ` · Assigned by ${a.assigned_by_name}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'payouts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {payouts.length === 0 && <div style={{ color: '#94a3b8' }}>No payout requests.</div>}
          {payouts.map((r) => (
            <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>₹{Number(r.requested_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{r.partner_name} · {r.status} · {new Date(r.created_at).toLocaleDateString('en-IN')}</div>
              </div>
              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handlePayoutAction(r.id, 'approved')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}>Approve</button>
                  <button onClick={() => handlePayoutAction(r.id, 'rejected')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}>Reject</button>
                </div>
              )}
              {r.status === 'approved' && (
                <button onClick={() => handlePayoutAction(r.id, 'paid')} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Mark Paid</button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'create' && <CreatePartnerForm onCreated={() => setTab('pending')} />}
    </div>
  );
}

function CreatePartnerForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', specialty: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await createPartner(form);
      onCreated();
    } catch (ex) {
      setErr(ex.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {err && <div style={{ color: '#dc2626' }}>{err}</div>}
      {[
        ['Name', 'name', 'text', true],
        ['Email', 'email', 'email', true],
        ['Password (min 8)', 'password', 'password', true],
        ['Specialty', 'specialty', 'text', false],
      ].map(([label, key, type, required]) => (
        <div key={key}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</label>
          <input
            type={type}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            required={required}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
      ))}
      <button type="submit" disabled={saving} style={{
        padding: '10px 0', background: '#ea580c', color: '#fff', border: 'none',
        borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1,
      }}>
        {saving ? 'Creating…' : 'Create Partner'}
      </button>
    </form>
  );
}
