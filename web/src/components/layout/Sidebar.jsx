import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: '🏠 Dashboard', exact: true },
  { to: '/clients', label: '👥 Clients' },
  { to: '/services', label: '📋 Services & Tasks' },
  { to: '/documents', label: '📂 Documents' },
  { to: '/invoices', label: '💰 Invoices & Ledger' },
  { to: '/calendar', label: '📅 Calendar & Appointments' },
  { to: '/credentials', label: '🔑 Credentials Vault' },
  { to: '/registers', label: '📊 Registers' },
  { to: '/leads', label: '🎯 Leads & Quotations' },
  { to: '/settings', label: '⚙️ Settings' },
];

export default function Sidebar() {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>
        <span style={styles.brandIcon}>⚖️</span>
        <div>
          <div style={styles.brandName}>CA Rahul Gupta</div>
          <div style={styles.brandSub}>Office Portal</div>
        </div>
      </div>
      <nav>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div style={styles.userInfo}>
        <div style={styles.avatar}>RG</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>CA Rahul Gupta</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Admin</div>
        </div>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: { width: 240, minHeight: '100vh', background: '#1e293b', color: '#e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  brand: { padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #334155' },
  brandIcon: { fontSize: 28 },
  brandName: { fontWeight: 700, fontSize: 15, color: '#f1f5f9' },
  brandSub: { fontSize: 11, color: '#64748b' },
  navLink: { display: 'block', padding: '10px 16px', color: '#94a3b8', textDecoration: 'none', fontSize: 13, borderLeft: '3px solid transparent', transition: 'all 0.15s' },
  navLinkActive: { color: '#60a5fa', background: '#1e3a5f', borderLeftColor: '#60a5fa' },
  userInfo: { marginTop: 'auto', padding: '16px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0 },
};
