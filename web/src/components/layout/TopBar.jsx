import { useState } from 'react';
import { Search, Bell, ChevronRight, User } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const breadcrumbMap = {
  '/':            ['Home'],
  '/clients':     ['Home', 'Clients'],
  '/services':    ['Home', 'Services & Tasks'],
  '/documents':   ['Home', 'Documents'],
  '/invoices':    ['Home', 'Invoices & Ledger'],
  '/calendar':    ['Home', 'Calendar'],
  '/credentials': ['Home', 'Credentials Vault'],
  '/registers':   ['Home', 'Registers'],
  '/leads':       ['Home', 'Leads & Quotations'],
  '/settings':    ['Home', 'Settings'],
};

export default function TopBar({ title }) {
  const [search, setSearch] = useState('');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const loc = useLocation();
  const crumbs = breadcrumbMap[loc.pathname] || ['Home'];
  const pageTitle = crumbs[crumbs.length - 1];

  return (
    <header style={styles.bar}>
      {/* Left: breadcrumb + title */}
      <div style={styles.left}>
        <div style={styles.breadcrumb}>
          {crumbs.map((c, i) => (
            <span key={i} style={styles.crumbWrap}>
              {i > 0 && <ChevronRight size={12} style={{ color: '#94a3b8', margin: '0 2px' }} />}
              <span style={i === crumbs.length - 1 ? styles.crumbActive : styles.crumb}>{c}</span>
            </span>
          ))}
        </div>
        <div style={styles.title}>{pageTitle}</div>
      </div>

      {/* Right: search + bell + avatar */}
      <div style={styles.right}>
        <div style={styles.searchWrap}>
          <Search size={14} style={styles.searchIcon} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client / service…"
            style={styles.searchInput}
          />
        </div>

        <button style={styles.iconBtn} title="Notifications">
          <Bell size={18} color="#64748b" />
          <span style={styles.notifDot} />
        </button>

        <div style={{ position: 'relative' }}>
          <button
            style={styles.avatarBtn}
            onClick={() => setAvatarOpen(v => !v)}
            title="Account menu"
          >
            <div style={styles.avatarCircle}>RG</div>
            <div style={styles.avatarInfo}>
              <span style={styles.avatarName}>CA Rahul Gupta</span>
              <span style={styles.avatarRole}>Admin</span>
            </div>
          </button>
          {avatarOpen && (
            <div style={styles.dropMenu}>
              <div style={styles.dropItem}>My Profile</div>
              <div style={styles.dropItem}>Change Password</div>
              <div style={{ ...styles.dropItem, borderTop: '1px solid #f1f5f9', color: '#ef4444', marginTop: 4, paddingTop: 8 }}>Sign Out</div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const styles = {
  bar: {
    height: 60,
    background: '#fff',
    borderBottom: '1px solid #E6E8F0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    flexShrink: 0,
    gap: 16,
  },
  left: { display: 'flex', flexDirection: 'column', gap: 1 },
  breadcrumb: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' },
  crumbWrap: { display: 'flex', alignItems: 'center' },
  crumb: { fontSize: 11, color: '#94a3b8', fontWeight: 500 },
  crumbActive: { fontSize: 11, color: '#3B82F6', fontWeight: 600 },
  title: { fontSize: 20, fontWeight: 700, color: '#0B1F3B', lineHeight: 1.2 },
  right: { display: 'flex', alignItems: 'center', gap: 12 },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: { position: 'absolute', left: 10, color: '#94a3b8', pointerEvents: 'none' },
  searchInput: {
    paddingLeft: 32,
    paddingRight: 12,
    paddingTop: 7,
    paddingBottom: 7,
    border: '1px solid #E6E8F0',
    borderRadius: 8,
    fontSize: 13,
    color: '#334155',
    background: '#F6F7FB',
    outline: 'none',
    width: 220,
  },
  iconBtn: {
    position: 'relative',
    background: 'none',
    border: '1px solid #E6E8F0',
    borderRadius: 8,
    width: 36,
    height: 36,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  notifDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#ef4444',
    border: '1.5px solid #fff',
  },
  avatarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'none',
    border: '1px solid #E6E8F0',
    borderRadius: 10,
    padding: '5px 10px 5px 6px',
    cursor: 'pointer',
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 11,
    color: '#fff',
    flexShrink: 0,
    letterSpacing: '0.03em',
  },
  avatarInfo: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  avatarName: { fontSize: 12, fontWeight: 600, color: '#1e293b', lineHeight: 1.2 },
  avatarRole: { fontSize: 10, color: '#94a3b8' },
  dropMenu: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 6px)',
    background: '#fff',
    border: '1px solid #E6E8F0',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
    minWidth: 160,
    zIndex: 100,
    padding: '6px 0',
  },
  dropItem: {
    padding: '8px 14px',
    fontSize: 13,
    color: '#334155',
    cursor: 'pointer',
    fontWeight: 500,
  },
};
