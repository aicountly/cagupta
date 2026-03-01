import { dashboardStats, mockTasks, mockInvoices, mockAppointments } from '../data/mockData';
import StatusBadge from '../components/common/StatusBadge';

const StatCard = ({ icon, label, value, sub, color }) => (
  <div style={{ background: '#fff', borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: 24 }}>{icon}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', marginTop: 8 }}>{value}</div>
    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: color, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
  </div>
);

export default function Dashboard() {
  const overdueTasks = mockTasks.filter(t => t.status !== 'done' && t.dueDate < '2025-06-17');
  const pendingInvoices = mockInvoices.filter(i => ['sent','partially_paid','overdue'].includes(i.status));

  return (
    <div style={{ padding: 24 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon="👥" label="Active Clients" value={dashboardStats.activeClients} color="#2563eb" />
        <StatCard icon="📋" label="Active Services" value={dashboardStats.activeServices} color="#7c3aed" />
        <StatCard icon="✅" label="Pending Tasks" value={dashboardStats.pendingTasks} sub="3 due this week" color="#d97706" />
        <StatCard icon="💰" label="Outstanding Amount" value={`₹${dashboardStats.totalOutstanding.toLocaleString('en-IN')}`} sub="1 overdue invoice" color="#dc2626" />
        <StatCard icon="📂" label="Documents This Month" value={dashboardStats.documentsThisMonth} color="#0891b2" />
        <StatCard icon="📅" label="Appointments Today" value={dashboardStats.appointmentsToday} color="#16a34a" />
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

const cardStyle = { background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)' };
const cardTitle = { margin: '0 0 14px 0', fontSize: 15, fontWeight: 700, color: '#1e293b' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600, fontSize: 12, borderBottom: '1px solid #f1f5f9' };
const tdStyle = { padding: '8px 8px', color: '#334155', verticalAlign: 'middle' };
const trStyle = { borderBottom: '1px solid #f8fafc' };
const actionBtn = { padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'left', fontWeight: 500, color: '#334155' };
