import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Bell, ChevronRight, Settings, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { getInitials } from '../../../utils/getInitials';
import { useNotification } from '../../../context/NotificationContext';
import { ROLE_LABELS } from '../../../constants/roles';
import { getContacts } from '../../../services/contactService';
import { getOrganizationsForSearch } from '../../../services/organizationService';
import { getEngagements } from '../../../services/engagementService';
import { getLeads } from '../../../services/leadService';
import { getTxns } from '../../../services/txnService';
import { getAppointments } from '../../../services/appointmentService';
import { kpiLabelFromSlug } from '../../../utils/serviceKpiFilters';
import { fetchStaffNotifications, markStaffNotificationsRead } from '../../../services/notificationService';

const breadcrumbMap = {
  '/':                       ['Home'],
  '/clients':                ['Home', 'Clients'],
  '/clients/contacts':       ['Home', 'Clients', 'Contacts'],
  '/clients/organizations':  ['Home', 'Clients', 'Organizations'],
  '/clients/organizations/new': ['Home', 'Clients', 'Organizations', 'Add Organization'],
  '/services':               ['Home', 'Services & Tasks'],
  '/services/new':           ['Home', 'Services & Tasks', 'New Service Engagement'],
  '/services/edit':          ['Home', 'Services & Tasks', 'Edit engagement'],
  '/services/manage':        ['Home', 'Services & Tasks', 'Manage engagement'],
  '/services/files':         ['Home', 'Services & Tasks', 'Engagement files'],
  '/documents':              ['Home', 'Documents'],
  '/invoices':               ['Home', 'Invoices & Ledger'],
  '/inbox':                  ['Home', 'Inbox & tickets'],
  '/desk/chat':              ['Home', 'Team Chat'],
  '/desk/chat/audit':        ['Home', 'Team Chat', 'Audit log'],
  '/desk/client-chat':       ['Home', 'Client Chat'],
  '/reports/client-engagement': ['Home', 'Client engagement gaps'],
  '/calendar':               ['Home', 'Calendar'],
  '/credentials':            ['Home', 'Credentials Vault'],
  '/registers':              ['Home', 'Registers'],
  '/leads':                  ['Home', 'Leads & Quotations'],
  '/search':                 ['Home', 'Search'],
  '/settings':               ['Home', 'Settings'],
  '/profile':                ['Home', 'My Profile'],
};

export default function TopBar({ title }) {
  const [search, setSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [staffNotifs, setStaffNotifs] = useState([]);
  const [staffUnread, setStaffUnread] = useState(0);
  const dropdownRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);
  const settingsRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const loc = useLocation();
  const navigate = useNavigate();
  const { session, logout, hasAnyPermission } = useAuth();
  const { notifications, clearNotification } = useNotification();
  const crumbs = (() => {
    const p = loc.pathname;
    if (breadcrumbMap[p]) return breadcrumbMap[p];
    if (/^\/services\/focus\//.test(p)) {
      const slug = p.split('/').pop() || '';
      return ['Home', 'Services & Tasks', kpiLabelFromSlug(slug)];
    }
    if (/^\/services\/[^/]+\/edit$/.test(p)) return ['Home', 'Services & Tasks', 'Edit engagement'];
    if (/^\/services\/[^/]+\/files$/.test(p)) return ['Home', 'Services & Tasks', 'Engagement files'];
    if (/^\/services\/[^/]+$/.test(p) && p !== '/services/new') {
      return ['Home', 'Services & Tasks', 'Manage engagement'];
    }
    return ['Home'];
  })();
  const pageTitle = crumbs[crumbs.length - 1];

  const user = session?.user;
  const displayName = user?.name || 'CA Rahul Gupta';
  const initials = user?.initials || getInitials(displayName);

  function handleSignOut() {
    setAvatarOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  const runTopbarSearch = useCallback((val) => {
    if (val.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    Promise.all([
      getContacts({ search: val, perPage: 15 }).catch(() => []),
      getOrganizationsForSearch(val, 15).catch(() => []),
      getEngagements({ search: val, perPage: 15 }).catch(() => []),
      getLeads({ search: val, perPage: 15 }).catch(() => []),
      getTxns({ txnType: 'invoice', search: val, perPage: 10 }).then(r => r.txns).catch(() => []),
      getAppointments({ search: val, perPage: 10 }).catch(() => []),
    ]).then(([contacts, orgs, services, leads, invoiceTxns, appts]) => {
      const results = [];
      (contacts || []).slice(0, 3).forEach(c => {
        results.push({
          type: 'contact',
          id: c.id,
          label: c.displayName,
          sublabel: c.city || c.clientCode || 'Contact',
        });
      });
      (orgs || []).slice(0, 3).forEach(o => {
        results.push({
          type: 'organization',
          id: o.id,
          label: o.displayName,
          sublabel: o.city || o.clientCode || 'Organization',
        });
      });
      (services || []).slice(0, 2).forEach(s => {
        results.push({
          type: 'service',
          id: s.id,
          label: s.clientName || 'Service',
          sublabel: s.type || 'Engagement',
        });
      });
      (leads || []).slice(0, 2).forEach(l => {
        results.push({
          type: 'lead',
          id: l.id,
          label: l.contactName || 'Lead',
          sublabel: l.company || l.stage || 'Lead',
        });
      });
      (invoiceTxns || []).slice(0, 2).forEach(inv => {
        results.push({
          type: 'invoice',
          id: inv.id,
          label: inv.invoiceNumber || `Invoice #${inv.id}`,
          sublabel: inv.clientName || 'Invoice',
        });
      });
      (appts || []).slice(0, 2).forEach(a => {
        results.push({
          type: 'appointment',
          id: a.id,
          label: a.subject || a.clientName || 'Appointment',
          sublabel: [a.date, a.startTime].filter(Boolean).join(' ') || 'Calendar',
        });
      });
      setSearchResults(results.slice(0, 8));
      setShowSearchResults(true);
    });
  }, []);

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearch(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (val.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => runTopbarSearch(val), 280);
  }

  function handleSearchKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = search.trim();
      if (v.length >= 2) {
        navigate(`/search?q=${encodeURIComponent(v)}`);
        setShowSearchResults(false);
      }
    }
  }

  function handleResultClick(r) {
    const q = search.trim();
    if (q.length >= 2) {
      navigate(`/search?q=${encodeURIComponent(q)}&highlight=${r.type}:${r.id}`);
    } else {
      navigate('/search');
    }
    setSearch('');
    setSearchResults([]);
    setShowSearchResults(false);
  }

  const typeIcons = {
    contact: '👤',
    organization: '🏢',
    service: '📋',
    lead: '🎯',
    invoice: '🧾',
    appointment: '📅',
  };

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
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false);
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

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const loadStaffNotifications = useCallback(() => {
    if (!session?.token) return;
    fetchStaffNotifications(30)
      .then(({ rows, unread }) => {
        setStaffNotifs(Array.isArray(rows) ? rows : []);
        setStaffUnread(typeof unread === 'number' ? unread : 0);
      })
      .catch(() => {});
  }, [session?.token]);

  useEffect(() => {
    loadStaffNotifications();
    const t = setInterval(loadStaffNotifications, 120000);
    return () => clearInterval(t);
  }, [loadStaffNotifications]);

  useEffect(() => {
    if (notifOpen) loadStaffNotifications();
  }, [notifOpen, loadStaffNotifications]);

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
              onKeyDown={handleSearchKeyDown}
              placeholder="Search everywhere…"
              style={styles.searchInput}
              aria-autocomplete="list"
              aria-expanded={showSearchResults}
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
                    onMouseDown={e => { e.preventDefault(); handleResultClick(r); }}
                    onClick={() => handleResultClick(r)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleResultClick(r)}
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
            onClick={() => { setNotifOpen(v => !v); setSettingsOpen(false); setAvatarOpen(false); }}
          >
            <Bell size={18} color="#64748b" />
            {(staffUnread > 0 || notifications.length > 0) && (
              staffUnread > 0 ? (
                <span style={styles.notifBadge}>{staffUnread > 9 ? '9+' : staffUnread}</span>
              ) : (
                <span style={styles.notifDot} />
              )
            )}
          </button>
          {notifOpen && (
            <div style={styles.notifDropdown}>
              <div style={{ padding: '10px 14px 8px', fontWeight: 700, fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Notifications</span>
                {staffUnread > 0 && (
                  <button
                    type="button"
                    onClick={() => markStaffNotificationsRead({ all: true }).then(() => loadStaffNotifications()).catch(() => {})}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {staffNotifs.length === 0 && notifications.length === 0 ? (
                <div style={{ padding: '16px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No new notifications</div>
              ) : (
                <>
                  {staffNotifs.map((row) => (
                    <div
                      key={`s-${row.id}`}
                      style={{
                        ...styles.notifItem,
                        cursor: (row.kind === 'chat_message' || row.kind === 'client_chat_escalation') && row.entity_id ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (row.kind === 'chat_message' && row.entity_id) {
                          markStaffNotificationsRead({ ids: [row.id] }).then(() => {
                            loadStaffNotifications();
                            if (loc.pathname === '/desk/chat') {
                              navigate(`/desk/chat?conversation=${row.entity_id}`);
                            } else {
                              window.dispatchEvent(new CustomEvent('cagupta:team-chat:open', {
                                detail: { conversationId: row.entity_id },
                              }));
                            }
                            setNotifOpen(false);
                          }).catch(() => {});
                        } else if (row.kind === 'client_chat_escalation' && row.entity_id) {
                          markStaffNotificationsRead({ ids: [row.id] }).then(() => {
                            loadStaffNotifications();
                            navigate(`/desk/client-chat?thread=${row.entity_id}`);
                            setNotifOpen(false);
                          }).catch(() => {});
                        }
                      }}
                      role={(row.kind === 'chat_message' || row.kind === 'client_chat_escalation') && row.entity_id ? 'button' : undefined}
                    >
                      <span style={{ fontSize: 16 }}>
                        {row.kind === 'chat_message' ? '💬' : row.kind === 'client_chat_escalation' ? '🆘' : '🔔'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{row.title}</div>
                        {row.body ? <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{row.body}</div> : null}
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{row.created_at ? formatTimestamp(row.created_at) : ''}{!row.read_at ? ' · Unread' : ''}</div>
                      </div>
                      {!row.read_at && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markStaffNotificationsRead({ ids: [row.id] }).then(() => loadStaffNotifications()).catch(() => {});
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 11, flexShrink: 0, fontWeight: 600 }}
                        >
                          Read
                        </button>
                      )}
                    </div>
                  ))}
                  {notifications.map(n => (
                    <div key={n.id} style={styles.notifItem}>
                      <span style={{ fontSize: 16 }}>{n.type === 'lead' ? '🎯' : n.type === 'appointment' ? '📅' : n.type === 'service' ? '📋' : '🔔'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{n.message}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatTimestamp(n.timestamp)}</div>
                      </div>
                      <button type="button" onClick={() => clearNotification(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: '0 2px', flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={settingsRef}>
          <button
            style={styles.iconBtn}
            title="Settings"
            onClick={() => { setSettingsOpen(v => !v); setNotifOpen(false); setAvatarOpen(false); }}
          >
            <Settings size={17} color="#64748b" />
          </button>
          {settingsOpen && (
            <div style={styles.dropMenu}>
              <div
                role="button"
                tabIndex={0}
                style={styles.dropItem}
                onClick={() => { setSettingsOpen(false); navigate('/settings'); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSettingsOpen(false); navigate('/settings'); } }}
              >
                <Settings size={14} style={{ marginRight: 8, opacity: 0.6, flexShrink: 0 }} />
                Settings
              </div>
              {hasAnyPermission(['users.manage', 'users.delegate']) && (
                <div
                  role="button"
                  tabIndex={0}
                  style={styles.dropItem}
                  onClick={() => { setSettingsOpen(false); navigate('/admin/users'); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSettingsOpen(false); navigate('/admin/users'); } }}
                >
                  <Users size={14} style={{ marginRight: 8, opacity: 0.6, flexShrink: 0 }} />
                  User Management
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            style={styles.avatarBtn}
            onClick={() => { setAvatarOpen(v => !v); setSettingsOpen(false); setNotifOpen(false); }}
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
              <div
                role="button"
                tabIndex={0}
                style={styles.dropItem}
                onClick={() => { setAvatarOpen(false); navigate('/profile'); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setAvatarOpen(false);
                    navigate('/profile');
                  }
                }}
              >
                My Profile
              </div>
              <div
                role="button"
                tabIndex={0}
                style={styles.dropItem}
                onClick={() => { setAvatarOpen(false); navigate({ pathname: '/profile', hash: 'password' }); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setAvatarOpen(false);
                    navigate({ pathname: '/profile', hash: 'password' });
                  }
                }}
              >
                Change Password
              </div>
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
  crumbActive: { fontSize: 11, color: 'var(--portal-primary)', fontWeight: 600 },
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
    background: 'var(--portal-bg)',
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
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    padding: '0 4px',
    borderRadius: 8,
    background: '#ef4444',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid #fff',
    lineHeight: 1,
    boxSizing: 'border-box',
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
    background: 'linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-primary-light) 100%)',
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
    display: 'flex',
    alignItems: 'center',
    padding: '8px 14px',
    fontSize: 13,
    color: '#334155',
    cursor: 'pointer',
    fontWeight: 500,
  },
};
