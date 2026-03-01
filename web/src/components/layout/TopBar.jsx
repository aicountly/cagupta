import { useState, useRef, useEffect } from 'react';
import { Search, Bell, AlignJustify, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const breadcrumbMap = {
  '/':            ['Dashboard'],
  '/clients':     ['Dashboard', 'Clients'],
  '/services':    ['Dashboard', 'Services & Tasks'],
  '/documents':   ['Dashboard', 'Documents'],
  '/invoices':    ['Dashboard', 'Invoices & Ledger'],
  '/calendar':    ['Dashboard', 'Calendar & Appointments'],
  '/credentials': ['Dashboard', 'Credentials Vault'],
  '/registers':   ['Dashboard', 'Registers'],
  '/leads':       ['Dashboard', 'Leads & Quotations'],
  '/settings':    ['Dashboard', 'Settings'],
};

const pageTitleMap = {
  '/':            'Dashboard',
  '/clients':     'Clients',
  '/services':    'Services & Tasks',
  '/documents':   'Documents',
  '/invoices':    'Invoices & Ledger',
  '/calendar':    'Calendar & Appointments',
  '/credentials': 'Credentials Vault',
  '/registers':   'Registers',
  '/leads':       'Leads & Quotations',
  '/settings':    'Settings',
};

export default function TopBar() {
  const [search, setSearch] = useState('');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const dropdownRef = useRef(null);
  const loc = useLocation();
  const crumbs = breadcrumbMap[loc.pathname] || ['Dashboard'];
  const pageTitle = pageTitleMap[loc.pathname] || 'CA Office Portal';

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header style={styles.bar}>
      {/* Left: hamburger | divider | page title | breadcrumb */}
      <div style={styles.left}>
        <div style={styles.menuIconWrap}>
          <AlignJustify size={18} color="#374151" />
        </div>
        <div style={styles.divider} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={styles.pageTitle}>{pageTitle}</span>
          <div style={styles.breadcrumb}>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <ChevronRight size={12} style={{ color: '#9CA3AF', margin: '0 3px' }} />}
                <span style={i === crumbs.length - 1 ? styles.crumbActive : styles.crumb}>{c}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: search + bell + avatar */}
      <div style={styles.right}>
        <div style={styles.searchWrap}>
          <Search size={14} style={styles.searchIcon} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client / service..."
            style={styles.searchInput}
          />
        </div>

        <button style={styles.iconBtn} title="Notifications">
          <Bell size={18} color="#374151" />
          <span style={styles.notifBadge}>3</span>
        </button>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            style={styles.avatarBtn}
            onClick={() => setAvatarOpen(v => !v)}
            title="Account menu"
          >
            <div style={styles.avatarCircle}>RG</div>
          </button>
          {avatarOpen && (
            <div style={styles.dropMenu}>
              <div style={styles.dropItem} onClick={() => setAvatarOpen(false)}>My Profile</div>
              <div style={styles.dropItem} onClick={() => setAvatarOpen(false)}>Change Password</div>
              <div
                style={{ ...styles.dropItem, borderTop: '1px solid #f3f4f6', color: '#ef4444', marginTop: 4, paddingTop: 8 }}
                onClick={() => setAvatarOpen(false)}
              >
                Sign Out
              </div>
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
    borderBottom: '1px solid #E5E7EB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    flexShrink: 0,
    gap: 16,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: '1px solid #E5E7EB',
    cursor: 'pointer',
    flexShrink: 0,
  },
  divider: {
    width: 1,
    height: 24,
    background: '#E5E7EB',
    flexShrink: 0,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
    whiteSpace: 'nowrap',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
  },
  crumb: { fontSize: 13, color: '#9CA3AF', fontWeight: 400 },
  crumbActive: { fontSize: 13, color: '#111827', fontWeight: 600 },
  right: { display: 'flex', alignItems: 'center', gap: 10 },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: { position: 'absolute', left: 11, color: '#9CA3AF', pointerEvents: 'none' },
  searchInput: {
    paddingLeft: 34,
    paddingRight: 14,
    paddingTop: 8,
    paddingBottom: 8,
    border: '1px solid #E5E7EB',
    borderRadius: 9999,
    fontSize: 13,
    color: '#374151',
    background: '#F9FAFB',
    outline: 'none',
    width: 220,
  },
  iconBtn: {
    position: 'relative',
    background: 'none',
    border: '1px solid #E5E7EB',
    borderRadius: 9999,
    width: 38,
    height: 38,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 9999,
    background: '#F37920',
    color: '#fff',
    fontSize: 9,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid #fff',
    lineHeight: 1,
    padding: '0 3px',
  },
  avatarBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    borderRadius: '50%',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#E5E7EB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 12,
    color: '#374151',
    border: '2px solid #E5E7EB',
  },
  dropMenu: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 6px)',
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
    minWidth: 160,
    zIndex: 100,
    padding: '6px 0',
  },
  dropItem: {
    padding: '8px 14px',
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
    fontWeight: 500,
  },
};
