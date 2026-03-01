import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, FolderOpen,
  Receipt, CalendarDays, KeyRound, BookOpen,
  Target, Settings, ChevronDown,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/services', label: 'Services & Tasks', icon: ClipboardList },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/invoices', label: 'Invoices & Ledger', icon: Receipt },
  { to: '/calendar', label: 'Calendar & Appointments', icon: CalendarDays },
  { to: '/credentials', label: 'Credentials Vault', icon: KeyRound },
  { to: '/registers', label: 'Registers', icon: BookOpen },
  { to: '/leads', label: 'Leads & Quotations', icon: Target },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside style={styles.sidebar}>
      {/* Brand */}
      <div style={styles.brand}>
        <div style={styles.logoWrap}>
          <span style={styles.logoCa}>CA</span>
          <span style={styles.logoX}>✕</span>
        </div>
        <div>
          <div style={styles.brandTitle}>
            <span style={{ color: '#F37920', fontWeight: 800, fontSize: 17 }}>CA</span>
            <span style={{ color: '#111827', fontWeight: 800, fontSize: 17, marginLeft: 2 }}> INDIA</span>
          </div>
          <div style={styles.brandSub}>Office Portal</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              {({ isActive }) => (
                <>
                  <span style={{ ...styles.navIcon, ...(isActive ? styles.navIconActive : {}) }}>
                    <Icon size={16} />
                  </span>
                  <span style={{ ...styles.navLabel, color: isActive ? '#F37920' : '#374151' }}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User card */}
      <div style={styles.userCard}>
        <div style={styles.avatar}>RG</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>Rahul Gupta</div>
          <div style={{ fontSize: 11, color: '#6B7280' }}>Admin</div>
        </div>
        <ChevronDown size={14} color="#9CA3AF" />
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 256,
    minHeight: '100vh',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    borderRight: '1px solid #E5E7EB',
  },
  brand: {
    padding: '18px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderBottom: '1px solid #F3F4F6',
  },
  logoWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    background: '#fff',
    border: '2px solid #F37920',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    flexShrink: 0,
  },
  logoCa: { fontWeight: 900, fontSize: 13, color: '#F37920', letterSpacing: '-0.5px', lineHeight: 1 },
  logoX: { fontWeight: 900, fontSize: 11, color: '#55B848', lineHeight: 1 },
  brandTitle: { lineHeight: 1.2 },
  brandSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontWeight: 400 },
  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    textDecoration: 'none',
    fontSize: 13.5,
    fontWeight: 500,
    color: '#374151',
    borderLeft: '3px solid transparent',
    transition: 'background 0.12s',
  },
  navLinkActive: {
    background: '#FEF3E8',
    borderLeft: '3px solid #F37920',
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
    flexShrink: 0,
  },
  navIconActive: {
    color: '#F37920',
  },
  navLabel: {
    flex: 1,
  },
  userCard: {
    padding: '14px 16px',
    borderTop: '1px solid #F3F4F6',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 12,
    color: '#fff',
    flexShrink: 0,
  },
};
