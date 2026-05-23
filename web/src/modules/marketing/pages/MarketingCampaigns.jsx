import { useState } from 'react';
import {
  Megaphone, Plus, Send, Clock, CheckCircle2, AlertCircle,
  BarChart3, Users, Mail, MessageSquare, Share2, Eye, Trash2,
  TrendingUp, Filter,
} from 'lucide-react';

const MOCK_CAMPAIGNS = [
  {
    id: 1, name: 'ITR Season 2026', type: 'multi', channels: ['email', 'sms', 'whatsapp'],
    audience: 'All Clients', status: 'active', sent: 248, opened: 167, clicked: 43,
    startDate: '2026-04-01', endDate: '2026-07-31',
  },
  {
    id: 2, name: 'GST May Deadline', type: 'sms', channels: ['sms'],
    audience: 'GST Filers', status: 'scheduled', sent: 0, opened: 0, clicked: 0,
    startDate: '2026-05-15', endDate: '2026-05-20',
  },
  {
    id: 3, name: 'Banker Outreach Q1', type: 'email', channels: ['email', 'whatsapp'],
    audience: 'Affiliate Prospects', status: 'completed', sent: 56, opened: 34, clicked: 12,
    startDate: '2026-01-10', endDate: '2026-03-31',
  },
];

const CHANNEL_ICONS = { email: '✉', sms: '📱', whatsapp: '💬', social: '🌐' };
const STATUS_STYLES = {
  active: { bg: '#f0fdf4', color: '#16a34a' },
  scheduled: { bg: '#f5f3ff', color: '#7c3aed' },
  completed: { bg: '#f8fafc', color: '#475569' },
  paused: { bg: '#fffbeb', color: '#d97706' },
};

export default function MarketingCampaigns() {
  const [activeTab, setActiveTab] = useState('campaigns');

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Campaigns</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Plan, track and analyze your marketing campaigns across all channels
          </p>
        </div>
        <button style={btnPrimary}><Plus size={13} /> New Campaign</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Campaigns', value: '12', icon: Megaphone, color: 'var(--portal-primary)', bg: 'var(--portal-primary-tint)' },
          { label: 'Messages Sent', value: '3,482', icon: Send, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Avg. Open Rate', value: '68%', icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Conversions', value: '142', icon: CheckCircle2, color: '#7c3aed', bg: '#f5f3ff' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={stat.color} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Campaigns table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>All Campaigns</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...inputStyle, width: 'auto' }}>
              <option>All Channels</option>
              <option>Email</option>
              <option>SMS</option>
              <option>WhatsApp</option>
              <option>Social</option>
            </select>
            <select style={{ ...inputStyle, width: 'auto' }}>
              <option>All Status</option>
              <option>Active</option>
              <option>Scheduled</option>
              <option>Completed</option>
            </select>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              {['Campaign', 'Channels', 'Audience', 'Status', 'Sent', 'Opened', 'Clicked', 'Date Range', 'Actions'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_CAMPAIGNS.map((c) => {
              const statusStyle = STATUS_STYLES[c.status] || STATUS_STYLES.active;
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.name}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {c.channels.map((ch) => (
                        <span key={ch} title={ch} style={{ fontSize: 14 }}>{CHANNEL_ICONS[ch] || '?'}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontSize: 12, color: '#64748b' }}>{c.audience}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: statusStyle.bg, color: statusStyle.color }}>
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#1e293b' }}>{c.sent.toLocaleString()}</td>
                  <td style={{ padding: '12px', fontSize: 13, color: c.opened > 0 ? '#16a34a' : '#94a3b8' }}>
                    {c.opened > 0 ? `${c.opened} (${Math.round((c.opened / c.sent) * 100) || 0}%)` : '—'}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: c.clicked > 0 ? '#2563eb' : '#94a3b8' }}>
                    {c.clicked > 0 ? `${c.clicked} (${Math.round((c.clicked / c.sent) * 100) || 0}%)` : '—'}
                  </td>
                  <td style={{ padding: '12px', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {c.startDate} → {c.endDate}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11 }}><Eye size={11} /></button>
                      <button style={{ ...btnOutline, padding: '4px 10px', fontSize: 11, color: '#ef4444' }}><Trash2 size={11} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--portal-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnOutline = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const inputStyle = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };
