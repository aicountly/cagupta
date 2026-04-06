import { useState, useRef, useEffect } from 'react';
import { Search, Bell, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { getInitials } from '../../utils/getInitials';
import { useNotification } from '../../context/NotificationContext';
import { ROLE_LABELS } from '../../constants/roles';
import { getContacts } from '../../services/contactService';
import { getEngagements } from '../../services/engagementService';
import { getLeads } from '../../services/leadService';

const breadcrumbMap = {
  '/':                       ['Home'],
  '/clients':                ['Home', 'Clients'],
  '/clients/contacts':       ['Home', 'Clients', 'Contacts'],
  '/clients/organizations':  ['Home', 'Clients', 'Organizations'],
  '/clients/organizations/new': ['Home', 'Clients', 'Organizations', 'Add Organization'],
  '/services':               ['Home', 'Services & Tasks'],
  '/services/new':           ['Home', 'Services & Tasks', 'New Service Engagement'],
  '/documents':              ['Home', 'Documents'],
  '/invoices':               ['Home', 'Invoices & Ledger'],
  '/calendar':               ['Home', 'Calendar'],
  '/credentials':            ['Home', 'Credentials Vault'],
  '/registers':              ['Home', 'Registers'],
  '/leads':                  ['Home', 'Leads & Quotations'],
  '/settings':               ['Home', 'Settings'],
};

export default function TopBar({ title }) {
  const [search, setSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);
  const loc = useLocation();
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const { notifications, clearNotification } = useNotification();
  const crumbs = breadcrumbMap[loc.pathname] || ['Home'];
  const pageTitle = crumbs[crumbs.length - 1];

  const user = session?.user;
  const displayName = user?.name || 'CA Rahul Gupta';
  const initials = user?.initials || getInitials(displayName);

  function handleSignOut() {
    setAvatarOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearch(val);
    if (val.length >= 2) {
      const q = val.toLowerCase();
      Promise.all([
        getContacts({ search: val, perPage: 20 }).catch(() => []),
        getEngagements({ search: val, perPage: 20 }).catch(() => []),
        getLeads({ search: val, perPage: 20 }).catch(() => []),
      ]).then(([contacts, services, leads]) => {
        const results = [];
        contacts.forEach(c => {
          if (c.displayName.toLowerCase().includes(q)) {
            results.push({ label: c.displayName, sublabel: c.city || 'Contact', route: '/clients/contacts', type: 'contact' });
          }
        });
        services.forEach(s => {
          if ((s.clientName || '').toLowerCase().includes(q) || (s.type || '').toLowerCase().includes(q)) {
            results.push({ label: s.clientName, sublabel: s.type, route: '/services', type: 'service' });
          }
        });
        leads.forEach(l => {
          if ((l.contactName || l.name || '').toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q)) {
            results.push({ label: l.contactName || l.name, sublabel: l.company || 'Lead', route: '/leads', type: 'lead' });
          }
        });
        setSearchResults(results.slice(0, 8));
        setShowSearchResults(true);
      });
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }

  function handleResultClick(route) {
    navigate(route);
    setSearch('');
    setSearchResults([]);
    setShowSearchResults(false);
  }

  const typeIcons = { contact: '👤', org: '🏢', service: '📋', lead: '🎯' };

  function formatTimestamp(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  // Close the account menu when clicking anywhere outside it.
  // dropdownRef is intentionally omitted from the dependency array:
  // refs are stable across renders and do not need to trigger re-subscription.
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setAvatarOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
        <div style={{ position: 'relative' }} ref={searchRef}>
          <div style={styles.searchWrap}>
            <Search size={14} style={styles.searchIcon} />
            <input
              value={search}
              onChange={handleSearchChange}
              placeholder="Search client / service…"
              style={styles.searchInput}
            />
          </div>
          {showSearchResults && (
            <div style={styles.searchDropdown}>
              {searchResults.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>No results found.</div>
              ) : (
                searchResults.map((r, i) => (
                  <div
                    key={i}
                    style={{ ...styles.searchItem, cursor: 'pointer' }}
                    role="option"
                    tabIndex={0}
                    onMouseDown={e => { e.preventDefault(); handleResultClick(r.route); }}
                    onClick={() => handleResultClick(r.route)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleResultClick(r.route)}
                  >
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{typeIcons[r.type]}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.sublabel}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            style={styles.iconBtn}
            title="Notifications"
            onClick={() => setNotifOpen(v => !v)}
          >
            <Bell size={18} color="#64748b" />
            {notifications.length > 0 && <span style={styles.notifDot} />}
          </button>
          {notifOpen && (
            <div style={styles.notifDropdown}>
              <div style={{ padding: '10px 14px 8px', fontWeight: 700, fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9' }}>
                Notifications
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: '16px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No new notifications</div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} style={styles.notifItem}>
                    <span style={{ fontSize: 16 }}>{n.type === 'lead' ? '🎯' : n.type === 'appointment' ? '📅' : n.type === 'service' ? '📋' : '🔔'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatTimestamp(n.timestamp)}</div>
                    </div>
                    <button onClick={() => clearNotification(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: '0 2px', flexShrink: 0 }}>✕</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            style={styles.avatarBtn}
            onClick={() => setAvatarOpen(v => !v)}
            title="Account menu"
          >
            <div style={styles.avatarCircle}>{initials}</div>
            <div style={styles.avatarInfo}>
              <span style={styles.avatarName}>{displayName}</span>
              <span style={styles.avatarRole}>{ROLE_LABELS[user?.role] || user?.role || 'User'}</span>
            </div>
          </button>
          {avatarOpen && (
            <div style={styles.dropMenu}>
              <div style={styles.dropItem} onClick={() => setAvatarOpen(false)}>My Profile</div>
              <div style={styles.dropItem} onClick={() => setAvatarOpen(false)}>Change Password</div>
              <div
                style={{ ...styles.dropItem, borderTop: '1px solid #f1f5f9', color: '#ef4444', marginTop: 4, paddingTop: 8 }}
                onClick={handleSignOut}
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
  crumbActive: { fontSize: 11, color: '#F37920', fontWeight: 600 },
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
  searchDropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid #E6E8F0',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
    zIndex: 200,
    minWidth: 260,
    maxHeight: 320,
    overflowY: 'auto',
  },
  searchItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid #f8fafc',
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
  notifDropdown: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 6px)',
    background: '#fff',
    border: '1px solid #E6E8F0',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
    minWidth: 280,
    maxWidth: 340,
    zIndex: 200,
    maxHeight: 360,
    overflowY: 'auto',
  },
  notifItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 14px',
    borderBottom: '1px solid #f8fafc',
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
    background: 'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
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
