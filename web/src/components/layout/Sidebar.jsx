import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, FolderOpen,
  Receipt, CalendarDays, KeyRound, BookOpen,
  Target, Settings, ChevronRight,
} from 'lucide-react';

const navSections = [
  {
    label: 'MAIN',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/services', label: 'Services & Tasks', icon: ClipboardList },
      { to: '/documents', label: 'Documents', icon: FolderOpen },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { to: '/invoices', label: 'Invoices & Ledger', icon: Receipt },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/credentials', label: 'Credentials Vault', icon: KeyRound },
      { to: '/registers', label: 'Registers', icon: BookOpen },
      { to: '/leads', label: 'Leads & Quotations', icon: Target },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside style={styles.sidebar}>
      {/* Brand */}
      <div style={styles.brand}>
        <div style={styles.brandIconWrap}>
          <span style={styles.brandLogoText}>CA</span>
          <span style={styles.brandLogoSub}>INDIA</span>
        </div>
        <div>
          <div style={styles.brandName}>CA Rahul Gupta</div>
          <div style={styles.brandSub}>CA. Rahul Gupta Office Portal</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {navSections.map((section) => (
          <div key={section.label}>
            <div style={styles.sectionLabel}>{section.label}</div>
            {section.items.map((item) => {
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
                        <Icon size={15} />
                      </span>
                      <span style={styles.navText}>{item.label}</span>
                      {isActive && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User card */}
      <div style={styles.userCard}>
        <div style={styles.avatar}>RG</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>CA Rahul Gupta</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Admin · Mumbai</div>
        </div>
        <div style={styles.onlineDot} />
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 240,
    minHeight: '100vh',
    background: '#ffffff',
    color: '#334155',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    borderRight: '1px solid #E6E8F0',
    boxShadow: '1px 0 4px rgba(0,0,0,0.04)',
  },
  brand: {
    padding: '20px 16px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderBottom: '1px solid #F0F2F8',
  },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 9,
    background: '#F37920',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid rgba(243,121,32,0.4)',
    lineHeight: 1,
    gap: 0,
  },
  brandLogoText: { fontWeight: 900, fontSize: 13, color: '#fff', letterSpacing: '0.04em', lineHeight: 1 },
  brandLogoSub: { fontWeight: 700, fontSize: 8, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.12em', lineHeight: 1, marginTop: 1 },
  brandName: { fontWeight: 700, fontSize: 14, color: '#1e293b', lineHeight: '1.2' },
  brandSub: { fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: 500, letterSpacing: '0.01em' },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.08em',
    padding: '14px 20px 6px',
    textTransform: 'uppercase',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px 8px 16px',
    marginInline: 8,
    borderRadius: 8,
    color: '#64748b',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.15s',
    marginBottom: 1,
  },
  navLinkActive: {
    color: '#F37920',
    background: '#FEF0E6',
    fontWeight: 600,
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  navIconActive: { opacity: 1, color: '#F37920' },
  navText: { flex: 1 },
  userCard: {
    padding: '14px 16px',
    borderTop: '1px solid #F0F2F8',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#FAFBFD',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 12,
    color: '#fff',
    flexShrink: 0,
    letterSpacing: '0.03em',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#22c55e',
    flexShrink: 0,
    boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
  },
};
