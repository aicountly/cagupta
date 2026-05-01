import { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle, Mail, Smartphone, RefreshCw, Download, Filter } from 'lucide-react';
import { API_BASE_URL } from '../../../constants/config';
import VerificationBadge from '../../../components/verification/VerificationBadge';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function ContactVerificationExceptions() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('both');

  useEffect(() => {
    load();
  }, [typeFilter]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/contacts/verification/exceptions?type=${typeFilter}&limit=200`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load');
      setItems(data.data?.items || []);
      setTotal(data.data?.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const unverifiedEmail = items.filter((c) => !c.email_verified && c.email);
  const unverifiedMobile = items.filter((c) => !c.mobile_verified && c.mobile);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Verification Exceptions
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Clients with unverified email or mobile — {total} records
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="both">Email & Mobile</option>
            <option value="email">Unverified Email only</option>
            <option value="mobile">Unverified Mobile only</option>
          </select>
          <button onClick={load} style={btnOutline}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Exceptions', value: total, icon: AlertCircle, color: '#ef4444', bg: '#fef2f2' },
          { label: 'Unverified Email', value: unverifiedEmail.length, icon: Mail, color: '#d97706', bg: '#fffbeb' },
          { label: 'Unverified Mobile', value: unverifiedMobile.length, icon: Smartphone, color: '#7c3aed', bg: '#f5f3ff' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={stat.color} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['Name', 'Email', 'Email Status', 'Mobile', 'Mobile Status', 'Added'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13 }}>Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                  <ShieldCheck size={40} style={{ margin: '0 auto 12px', display: 'block', color: '#22c55e', opacity: 0.6 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>All contacts verified!</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>No unverified contacts found for the selected filter.</div>
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{c.name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{c.email || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {c.email ? (
                      <VerificationBadge
                        verified={c.email_verified}
                        field="email"
                        value={c.email}
                        clientId={c.id}
                        onVerified={load}
                      />
                    ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>No email</span>}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{c.mobile || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {c.mobile ? (
                      <VerificationBadge
                        verified={c.mobile_verified}
                        field="mobile"
                        value={c.mobile}
                        clientId={c.id}
                        onVerified={load}
                      />
                    ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>No mobile</span>}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const btnOutline = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const selectStyle = { padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc', outline: 'none', cursor: 'pointer' };
