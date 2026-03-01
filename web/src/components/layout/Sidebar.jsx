import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, FolderOpen,
  Receipt, CalendarDays, KeyRound, BookOpen,
  Target, Settings, ChevronRight,
} from 'lucide-react';
import CaIndiaLogo from '../common/CaIndiaLogo';

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
        <div style={styles.logoWrap}>
          <CaIndiaLogo width={100} height={34} />
        </div>
        <div style={styles.brandSub}>Office Portal</div>
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
          <div style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>CA Rahul Gupta</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Admin · Mumbai</div>
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
    background: 'linear-gradient(180deg, #0B1F3B 0%, #0f2a4a 100%)',
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.06)',
  },
  brand: {
    padding: '16px 16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  logoWrap: {
    borderRadius: 6,
    overflow: 'hidden',
    display: 'inline-flex',
    flexShrink: 0,
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
  },
  brandSub: { fontSize: 11, color: '#475569', marginTop: 2, paddingLeft: 2 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#334155',
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
    color: '#e0eaff',
    background: 'rgba(20,88,134,0.25)',
    fontWeight: 600,
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  navIconActive: { opacity: 1, color: '#5BA8D4' },
  navText: { flex: 1 },
  userCard: {
    padding: '14px 16px',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(0,0,0,0.15)',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #145886 0%, #1d7fbf 100%)',
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
    background: '#55B848',
    flexShrink: 0,
    boxShadow: '0 0 0 2px rgba(85,184,72,0.25)',
  },
};
