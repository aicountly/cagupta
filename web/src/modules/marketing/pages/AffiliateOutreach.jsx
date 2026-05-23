import { useState } from 'react';
import {
  Users, Plus, Send, MessageSquare, Mail, Phone,
  TrendingUp, Star, Target, Handshake, Building2,
  Filter, Search, BarChart3, CheckCircle2, Clock,
  Download, Upload, Eye,
} from 'lucide-react';
import { API_BASE_URL } from '../../../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const PROSPECT_TYPES = [
  { id: 'banker', label: 'Banker', icon: Building2, color: '#0A66C2', count: 34 },
  { id: 'accountant', label: 'Accountant', icon: Users, color: '#7c3aed', count: 21 },
  { id: 'lawyer', label: 'Lawyer / CS', icon: Star, color: '#ea580c', count: 12 },
  { id: 'consultant', label: 'Business Consultant', icon: TrendingUp, color: '#16a34a', count: 8 },
];

const MOCK_PROSPECTS = [
  { id: 1, name: 'Rajesh Sharma', type: 'banker', org: 'SBI Branch, Jaipur', mobile: '98XXXXXX01', email: 'rajesh@sbi.co.in', status: 'contacted', lastContact: '2026-04-28', source: 'referral' },
  { id: 2, name: 'Priya Agarwal', type: 'accountant', org: 'Agarwal & Co', mobile: '98XXXXXX02', email: 'priya@agarwal.com', status: 'interested', lastContact: '2026-04-25', source: 'linkedin' },
  { id: 3, name: 'Vikram Mehta', type: 'banker', org: 'HDFC Bank, Vaishali', mobile: '98XXXXXX03', email: 'vikram@hdfc.in', status: 'new', lastContact: null, source: 'manual' },
  { id: 4, name: 'Sunita Jain', type: 'accountant', org: 'Self Employed', mobile: '98XXXXXX04', email: 'sunita.jain@gmail.com', status: 'converted', lastContact: '2026-04-20', source: 'event' },
  { id: 5, name: 'Amit Gupta', type: 'lawyer', org: 'Gupta Legal', mobile: '98XXXXXX05', email: 'amit@guptalegal.com', status: 'not_interested', lastContact: '2026-04-15', source: 'cold_call' },
];

const STATUS_COLORS = {
  new: { bg: '#f1f5f9', color: '#475569' },
  contacted: { bg: '#eff6ff', color: '#2563eb' },
  interested: { bg: '#fffbeb', color: '#d97706' },
  converted: { bg: '#f0fdf4', color: '#16a34a' },
  not_interested: { bg: '#fef2f2', color: '#dc2626' },
};

const OUTREACH_TEMPLATES = [
  {
    id: 1, name: 'Introduction to CA Services', channel: 'email',
    subject: 'Partnership Opportunity – CA Services for Your Clients',
    body: `Dear {name},

I am CA Rahul Gupta, a practicing Chartered Accountant in Jaipur. I specialize in Income Tax, GST, Company Law, and audit services.

I believe there's a great opportunity for us to collaborate. Many of your clients may need professional CA services, and I can offer:
✓ Priority processing for referred clients
✓ Competitive commission structure
✓ Regular updates on compliance deadlines
✓ Dedicated support for your referrals

I'd love to connect and discuss how we can mutually benefit. Are you available for a brief call this week?

Warm regards,
CA Rahul Gupta
+91 98XXXXXXXX`,
  },
  {
    id: 2, name: 'WhatsApp Introduction', channel: 'whatsapp',
    subject: null,
    body: `Hi {name}! 👋

I'm CA Rahul Gupta from Jaipur. I help businesses and individuals with Income Tax, GST, and company compliance.

I'd love to explore if we can work together to help your clients with their CA needs.

Are you open for a quick chat? 😊`,
  },
];

export default function AffiliateOutreach() {
  const [activeTab, setActiveTab] = useState('prospects');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [newProspect, setNewProspect] = useState({ name: '', type: 'banker', org: '', mobile: '', email: '', source: 'manual' });

  const filtered = MOCK_PROSPECTS.filter((p) => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.org.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function openOutreach(prospect) {
    setSelectedProspect(prospect);
    setShowOutreachModal(true);
    setSelectedTemplate(null);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Affiliate Outreach</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Manage your affiliate channel — bankers, accountants & professionals
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btnOutline}><Upload size={13} /> Import CSV</button>
          <button onClick={() => setShowAddModal(true)} style={btnPrimary}><Plus size={13} /> Add Prospect</button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {PROSPECT_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={t.color} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{t.count}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t.label}s</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', width: 'fit-content', marginBottom: 20 }}>
        {[['prospects', 'Prospects'], ['campaigns', 'Campaigns'], ['commission', 'Commission Model']].map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === tab ? 'var(--portal-primary)' : '#f8fafc',
            color: activeTab === tab ? '#fff' : '#64748b',
            borderRight: '1px solid #e2e8f0',
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'prospects' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospects…" style={{ ...inputStyle, paddingLeft: 32 }} />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Types</option>
              {PROSPECT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Status</option>
              {['new', 'contacted', 'interested', 'converted', 'not_interested'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  {['Name', 'Type', 'Organization', 'Contact', 'Status', 'Last Contact', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const statusStyle = STATUS_COLORS[p.status] || STATUS_COLORS.new;
                  const typeInfo = PROSPECT_TYPES.find((t) => t.id === p.type);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.name}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: 11, background: `${typeInfo?.color}15`, color: typeInfo?.color, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          {typeInfo?.label || p.type}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: 12, color: '#64748b' }}>{p.org}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontSize: 12, color: '#1e293b' }}>{p.mobile}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.email}</div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: statusStyle.bg, color: statusStyle.color }}>
                          {p.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: 12, color: '#64748b' }}>{p.lastContact || '—'}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openOutreach(p)} style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }} title="Send Outreach">
                            <Send size={11} />
                          </button>
                          <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }} title="View">
                            <Eye size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13 }}>No prospects found.</div>
            )}
          </div>
        </>
      )}

      {activeTab === 'campaigns' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Outreach Campaigns</h3>
            <button style={btnPrimary}><Plus size={13} /> New Campaign</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {OUTREACH_TEMPLATES.map((t) => (
              <div key={t.id} style={{ padding: '16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.name}</div>
                  <span style={{ fontSize: 11, background: t.channel === 'email' ? '#eff6ff' : '#f0fdf4', color: t.channel === 'email' ? '#2563eb' : '#16a34a', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                    {t.channel.toUpperCase()}
                  </span>
                </div>
                {t.subject && <div style={{ fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 6 }}>{t.subject}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body.slice(0, 80)}…</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button style={{ ...btnPrimary, padding: '5px 12px', fontSize: 11 }}><Send size={11} /> Use Template</button>
                  <button style={{ ...btnOutline, padding: '5px 12px', fontSize: 11 }}><Eye size={11} /> Preview</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'commission' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Commission Structure</h3>
            {[
              { tier: 'Base', desc: 'Per client referred', amount: '₹1,000', color: 'var(--portal-primary)' },
              { tier: 'Silver', desc: '3+ clients/month', amount: '₹1,500 per client', color: '#94a3b8' },
              { tier: 'Gold', desc: '6+ clients/month', amount: '₹2,000 per client', color: '#d97706' },
              { tier: 'Platinum', desc: '10+ clients/month', amount: '5% of revenue', color: '#7c3aed' },
            ].map((tier) => (
              <div key={tier.tier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: tier.color }}>{tier.tier}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{tier.desc}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{tier.amount}</div>
              </div>
            ))}
          </div>
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Pitch Material</h3>
            {[
              { name: 'CA Services Brochure.pdf', size: '2.3 MB' },
              { name: 'Commission Guide.pdf', size: '512 KB' },
              { name: 'Referral Form.pdf', size: '128 KB' },
            ].map((doc) => (
              <div key={doc.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Target size={14} color="var(--portal-primary)" />
                  <div>
                    <div style={{ fontSize: 13, color: '#1e293b' }}>{doc.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{doc.size}</div>
                  </div>
                </div>
                <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}><Download size={11} /></button>
              </div>
            ))}
            <button style={{ ...btnPrimary, marginTop: 12, width: '100%', justifyContent: 'center' }}>
              <Plus size={13} /> Upload Material
            </button>
          </div>
        </div>
      )}

      {/* Add Prospect Modal */}
      {showAddModal && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth: 460 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>Add New Prospect</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input value={newProspect.name} onChange={(e) => setNewProspect((p) => ({ ...p, name: e.target.value }))} style={inputStyle} placeholder="e.g. Rajesh Sharma" />
              </div>
              <div>
                <label style={labelStyle}>Type *</label>
                <select value={newProspect.type} onChange={(e) => setNewProspect((p) => ({ ...p, type: e.target.value }))} style={inputStyle}>
                  {PROSPECT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Organization</label>
                <input value={newProspect.org} onChange={(e) => setNewProspect((p) => ({ ...p, org: e.target.value }))} style={inputStyle} placeholder="e.g. SBI Branch, Jaipur" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Mobile</label>
                  <input value={newProspect.mobile} onChange={(e) => setNewProspect((p) => ({ ...p, mobile: e.target.value }))} style={inputStyle} placeholder="91XXXXXXXXXX" />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input value={newProspect.email} onChange={(e) => setNewProspect((p) => ({ ...p, email: e.target.value }))} style={inputStyle} placeholder="email@example.com" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Source</label>
                <select value={newProspect.source} onChange={(e) => setNewProspect((p) => ({ ...p, source: e.target.value }))} style={inputStyle}>
                  {['manual', 'referral', 'linkedin', 'event', 'cold_call', 'website'].map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAddModal(false)} style={{ ...btnOutline, flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}><Plus size={13} /> Add Prospect</button>
            </div>
          </div>
        </div>
      )}

      {/* Outreach Modal */}
      {showOutreachModal && selectedProspect && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth: 560 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
              Outreach: {selectedProspect.name}
            </h3>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>{selectedProspect.org}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {OUTREACH_TEMPLATES.map((t) => (
                <div key={t.id} onClick={() => setSelectedTemplate(t)} style={{
                  padding: '12px', borderRadius: 8, cursor: 'pointer',
                  border: selectedTemplate?.id === t.id ? '2px solid var(--portal-primary)' : '1px solid #e2e8f0',
                  background: selectedTemplate?.id === t.id ? 'var(--portal-primary-tint)' : '#f8fafc',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>via {t.channel}</div>
                </div>
              ))}
            </div>
            {selectedTemplate && (
              <textarea value={selectedTemplate.body.replace('{name}', selectedProspect.name)} readOnly rows={8}
                style={{ ...inputStyle, resize: 'none', lineHeight: 1.7, fontFamily: 'inherit' }} />
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowOutreachModal(false)} style={{ ...btnOutline, flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button disabled={!selectedTemplate} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', opacity: selectedTemplate ? 1 : 0.5 }}>
                <Send size={13} /> Send via {selectedTemplate?.channel || '…'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--portal-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnOutline = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalCard = { background: '#fff', borderRadius: 16, padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '90%', maxHeight: '90vh', overflowY: 'auto' };
