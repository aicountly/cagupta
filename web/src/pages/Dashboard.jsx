import { dashboardStats, mockTasks, mockInvoices, mockAppointments } from '../data/mockData';
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

export default function Dashboard() {
  const overdueTasks = mockTasks.filter(t => t.status !== 'done' && t.dueDate < '2025-06-17');
  const pendingInvoices = mockInvoices.filter(i => ['sent','partially_paid','overdue'].includes(i.status));

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon="👥" label="Active Clients" value={dashboardStats.activeClients} color="#2563eb" bg="#EFF6FF" />
        <StatCard icon="📋" label="Active Services" value={dashboardStats.activeServices} color="#7c3aed" bg="#F5F3FF" />
        <StatCard icon="✅" label="Pending Tasks" value={dashboardStats.pendingTasks} sub="3 due this week" color="#d97706" bg="#FFFBEB" />
        <StatCard icon="💰" label="Outstanding Amount" value={`₹${dashboardStats.totalOutstanding.toLocaleString('en-IN')}`} sub="1 overdue invoice" color="#dc2626" bg="#FEF2F2" />
        <StatCard icon="📂" label="Documents This Month" value={dashboardStats.documentsThisMonth} color="#0891b2" bg="#ECFEFF" />
        <StatCard icon="📅" label="Appointments Today" value={dashboardStats.appointmentsToday} color="#16a34a" bg="#F0FDF4" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Pending / overdue tasks */}
        <section style={cardStyle}>
          <h3 style={cardTitle}>⚠️ Pending & Overdue Tasks</h3>
          <table style={tableStyle}>
            <thead>
              <tr>{['Task','Assigned To','Due','Priority'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {mockTasks.filter(t => t.status !== 'done').slice(0,4).map(t => (
                <tr key={t.id} style={trStyle}>
                  <td style={tdStyle}>{t.title}</td>
                  <td style={tdStyle}>{t.assignedTo}</td>
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
              <tr>{['Invoice #','Client','Amount','Status'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {pendingInvoices.map(inv => (
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

        {/* Today's appointments */}
        <section style={cardStyle}>
          <h3 style={cardTitle}>📅 Upcoming Appointments</h3>
          {mockAppointments.map(a => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.clientName}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{a.subject} — {a.date} {a.startTime} ({a.mode})</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </section>

        {/* Quick actions */}
        <section style={cardStyle}>
          <h3 style={cardTitle}>⚡ Quick Actions</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10, marginTop: 8 }}>
            {['➕ New Client','📋 New Service','📄 Upload Document','🧾 Raise Invoice','📅 Book Appointment','🔍 Search Clients'].map(a => (
              <button key={a} style={actionBtn}>{a}</button>
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
