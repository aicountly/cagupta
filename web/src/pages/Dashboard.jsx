import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../services/dashboardService';
import { getEngagements } from '../services/engagementService';
import { getInvoices } from '../services/invoiceService';
import { getAppointments } from '../services/appointmentService';
import StatusBadge from '../components/common/StatusBadge';

const StatCard = ({ icon, label, value, sub, color, bg }) => (
  <div style={{ background: '#fff', borderRadius: 14, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E6E8F0', display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{ width: 48, height: 48, borderRadius: 12, background: bg || '#F6F7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: color, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
    </div>
  </div>
);

const QUICK_ACTIONS = [
  { label: '➕ New Client',        path: '/clients/contacts/new' },
  { label: '📋 New Service',       path: '/services/new' },
  { label: '📄 Upload Document',   path: '/documents' },
  { label: '🧾 Raise Invoice',     path: '/invoices' },
  { label: '📅 Book Appointment',  path: '/calendar' },
  { label: '🔍 Search Clients',    path: '/clients/contacts' },
];

export default function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats]           = useState({ activeClients: '—', activeServices: '—', pendingTasks: '—', totalOutstanding: 0, documentsThisMonth: '—', appointmentsToday: '—' });
  const [tasks, setTasks]           = useState([]);
  const [invoices, setInvoices]     = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDashboardStats().catch(() => ({})),
      getEngagements().catch(() => []),
      getInvoices().catch(() => []),
      getAppointments().catch(() => []),
    ]).then(([s, eng, inv, appt]) => {
      setStats(s);
      // Non-completed tasks sorted by due date, top 4
      const pending = eng
        .filter(e => e.status !== 'completed')
        .flatMap(e => (e.tasks || []).filter(t => t.status !== 'done').map(t => ({ ...t, clientName: e.clientName })))
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
        .slice(0, 4);
      setTasks(pending);
      // Pending invoices
      setInvoices(inv.filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status)));
      // Upcoming / scheduled appointments
      setAppointments(appt.filter(a => a.status !== 'cancelled').slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  const outstandingFmt = typeof stats.totalOutstanding === 'number'
    ? `₹${stats.totalOutstanding.toLocaleString('en-IN')}`
    : stats.totalOutstanding;

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon="👥" label="Active Clients"        value={loading ? '…' : stats.activeClients}      color="#2563eb" bg="#EFF6FF" />
        <StatCard icon="📋" label="Active Services"       value={loading ? '…' : stats.activeServices}     color="#7c3aed" bg="#F5F3FF" />
        <StatCard icon="✅" label="Pending Tasks"         value={loading ? '…' : stats.pendingTasks}       sub="across all engagements" color="#d97706" bg="#FFFBEB" />
        <StatCard icon="💰" label="Outstanding Amount"    value={loading ? '…' : outstandingFmt}           sub="pending invoices" color="#dc2626" bg="#FEF2F2" />
        <StatCard icon="📂" label="Documents This Month"  value={loading ? '…' : stats.documentsThisMonth} color="#0891b2" bg="#ECFEFF" />
        <StatCard icon="📅" label="Appointments Today"    value={loading ? '…' : stats.appointmentsToday}  color="#16a34a" bg="#F0FDF4" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Pending / overdue tasks */}
        <section style={cardStyle}>
          <h3 style={cardTitle}>⚠️ Pending & Overdue Tasks</h3>
          <table style={tableStyle}>
            <thead>
              <tr>{['Task', 'Client', 'Due', 'Priority'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ ...tdStyle, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Loading…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={4} style={{ ...tdStyle, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No pending tasks.</td></tr>
              ) : tasks.map((t, i) => (
                <tr key={t.id || i} style={trStyle}>
                  <td style={tdStyle}>{t.title}</td>
                  <td style={tdStyle}>{t.clientName || t.assignedTo}</td>
                  <td style={tdStyle}>{t.dueDate}</td>
                  <td style={tdStyle}><StatusBadge status={t.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Pending invoices */}
        <section style={cardStyle}>
          <h3 style={cardTitle}>🧾 Pending Invoices</h3>
          <table style={tableStyle}>
            <thead>
              <tr>{['Invoice #', 'Client', 'Amount', 'Status'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ ...tdStyle, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Loading…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={4} style={{ ...tdStyle, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No pending invoices.</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} style={trStyle}>
                  <td style={tdStyle}>{inv.invoiceNumber}</td>
                  <td style={tdStyle}>{inv.clientName}</td>
                  <td style={tdStyle}>₹{(inv.totalAmount - inv.amountPaid).toLocaleString('en-IN')}</td>
                  <td style={tdStyle}><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Upcoming appointments */}
        <section style={cardStyle}>
          <h3 style={cardTitle}>📅 Upcoming Appointments</h3>
          {loading ? (
            <div style={{ color: '#94a3b8', padding: '16px 0', fontSize: 13 }}>Loading…</div>
          ) : appointments.length === 0 ? (
            <div style={{ color: '#94a3b8', padding: '16px 0', fontSize: 13 }}>No upcoming appointments.</div>
          ) : appointments.map(a => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.clientName}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{a.subject || a.title} — {a.date || a.eventDate} {a.startTime} ({a.mode || a.eventType})</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </section>

        {/* Quick actions */}
        <section style={cardStyle}>
          <h3 style={cardTitle}>⚡ Quick Actions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            {QUICK_ACTIONS.map(({ label, path }) => (
              <button key={label} style={actionBtn} onClick={() => navigate(path)}>{label}</button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const cardStyle = { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px solid #E6E8F0' };
const cardTitle = { margin: '0 0 14px 0', fontSize: 15, fontWeight: 700, color: '#1e293b' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #F0F2F8', background: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '9px 10px', color: '#334155', verticalAlign: 'middle' };
const trStyle = { borderBottom: '1px solid #F6F7FB' };
const actionBtn = { padding: '9px 12px', background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 10, cursor: 'pointer', fontSize: 13, textAlign: 'left', fontWeight: 500, color: '#334155' };

