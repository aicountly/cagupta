import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import logoUrl from '../../../assets/cropped_logo.png';
import { useAuth } from '../../../auth/AuthContext';
import { getInitials } from '../../../utils/getInitials';
import { getOverdueFollowUpCount } from '../../../services/serviceLogService';
import { fetchChatUnreadCount } from '../../chat/services/chatService';
import {
  LayoutDashboard, Users, ClipboardList, FolderOpen,
  Receipt, CalendarDays, KeyRound, BookOpen, Landmark, Wallet,
  Target, Settings, ChevronRight, ChevronDown,
  UserRound, Building2, ShieldCheck, Layers, Handshake, Briefcase, BarChart3, Bell,
  MessageSquare, Smartphone, Share2, Megaphone,
  Mail, CheckSquare, Inbox, Zap, BarChart2, Sparkles,
} from 'lucide-react';
import { ROLES, ROLE_LABELS } from '../../../constants/roles';

const navSections = [
  {
    label: 'MAIN',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      {
        label: 'Clients',
        icon: Users,
        navKey: 'clients',
        children: [
          { to: '/clients/contacts', label: 'Contacts', icon: UserRound },
          { to: '/clients/organizations', label: 'Organizations', icon: Building2 },
          { to: '/clients/groups', label: 'Groups', icon: Layers },
        ],
      },
      { to: '/services', label: 'Services & Tasks', icon: ClipboardList },
      { to: '/services/follow-ups', label: 'Pending Follow-ups', icon: Bell, permission: 'services.view', badge: 'overdue' },
      { to: '/documents', label: 'Documents', icon: FolderOpen },
      { to: '/calendar', label: 'Calendar & Appointments', icon: CalendarDays },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { to: '/finance/invoices-banking', label: 'Invoices & Banking', icon: Layers, permission: 'invoices.view' },
      { to: '/finance/cash-book', label: 'Cash book', icon: Wallet, permission: 'cash_book.view', unlessPermission: 'invoices.view' },
      { to: '/finance/payout-cycles', label: 'Payout Cycles', icon: Wallet, anyOf: ['affiliates.manage', 'partners.manage'] },
    ],
  },
  {
    label: 'MARKETING',
    items: [
      { to: '/marketing/tools',      label: 'Marketing Tools',    icon: Zap },
      { to: '/marketing/analytics',  label: 'Traffic Analytics',  icon: BarChart2 },
      { to: '/marketing/ai-insights',label: 'AI Insights',        icon: Sparkles },
      { to: '/marketing/blog/approvals', label: 'AI Approvals',   icon: CheckSquare },
      { to: '/leads',                label: 'Leads & Quotations', icon: Target },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { to: '/reports', label: 'Reports Hub', icon: BarChart3, permission: 'services.view' },
      { to: '/registers', label: 'Registers', icon: BookOpen },
      { to: '/credentials', label: 'Credentials Vault', icon: KeyRound },
    ],
  },
  {
    label: 'DESK',
    items: [
      { to: '/desk/inbox', label: 'Inbox & Tickets', icon: Inbox, permission: 'settings.view' },
      { to: '/desk/chat', label: 'Team Chat', icon: MessageSquare, permission: 'chat.use', badge: 'chatUnread' },
      { to: '/desk/client-chat', label: 'Client Chat', icon: Users, permission: 'client.chat.manage' },
    ],
  },
];

const adminNavItems = [
  {
    to: '/admin/approvals',
    label: 'Team Approvals',
    icon: CheckSquare,
    rolesAllowed: [ROLES.SUPER_ADMIN],
  },
  { to: '/admin/affiliates', label: 'Affiliates', icon: Handshake, permission: 'affiliates.manage' },
  { to: '/admin/partners', label: 'Partners', icon: Briefcase, permission: 'partners.manage' },
];

export default function Sidebar() {
  const loc = useLocation();
  const { session, hasPermission, hasAnyPermission } = useAuth();
  const [overdueCount, setOverdueCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  // Generic open-state map for expandable nav items, keyed by navKey
  const [openMenus, setOpenMenus] = useState(() => {
    const initial = {};
    if (loc.pathname.startsWith('/clients')) initial['clients'] = true;
    return initial;
  });

  const toggleMenu = (key) => setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));

  const user = session?.user;
  const displayName = user?.name || 'CA Rahul Gupta';
  const initials = user?.initials || getInitials(displayName);
  const roleName = user?.role || '';
  const roleLabel = ROLE_LABELS[roleName] || roleName || 'User';

  useEffect(() => {
    if (!hasPermission('services.view')) return;
    getOverdueFollowUpCount()
      .then(setOverdueCount)
      .catch(() => setOverdueCount(0));
  }, [hasPermission]);

  useEffect(() => {
    if (!hasPermission('chat.use')) return;
    const load = () => fetchChatUnreadCount().then(setChatUnreadCount).catch(() => setChatUnreadCount(0));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [hasPermission]);

  // Auto-open parent menus when a child route is active
  useEffect(() => {
    if (loc.pathname.startsWith('/clients')) setOpenMenus((p) => ({ ...p, clients: true }));
  }, [loc.pathname]);

  const visibleAdminItems = adminNavItems.filter((item) => {
    if (item.rolesAllowed?.length) {
      const r = String(roleName || '').toLowerCase();
      const em = String(user?.email || '').toLowerCase();
      const allowed = item.rolesAllowed.map((x) => String(x).toLowerCase());
      if (!allowed.includes(r) && em !== 'rahul@cagupta.in') return false;
    }
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.anyOf && !hasAnyPermission(item.anyOf)) return false;
    return true;
  });

  const renderNavItem = (item) => {
    const Icon = item.icon;
    if (item.rolesAllowed?.length) {
      const r = String(roleName || '').toLowerCase();
      const em = String(user?.email || '').toLowerCase();
      const allowed = item.rolesAllowed.map((x) => String(x).toLowerCase());
      if (!allowed.includes(r) && em !== 'rahul@cagupta.in') {
        return null;
      }
    }
    if (item.permission && !hasPermission(item.permission)) return null;
    if (item.unlessPermission && hasPermission(item.unlessPermission)) return null;
    if (item.anyOf && !hasAnyPermission(item.anyOf)) return null;

    // Expandable parent with children
    if (item.children) {
      const key = item.navKey || item.label;
      const isOpen = Boolean(openMenus[key]);
      const parentActive = item.children.some((ch) => loc.pathname.startsWith(ch.to));
      const visibleChildren = item.children.filter(
        (ch) => !ch.permission || hasPermission(ch.permission),
      );
      if (visibleChildren.length === 0) return null;
      return (
        <div key={item.label}>
          <button
            type="button"
            onClick={() => toggleMenu(key)}
            style={{
              ...styles.navLink,
              width: '100%',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              ...(parentActive ? styles.navLinkActive : {}),
            }}
          >
            <span style={{ ...styles.navIcon, ...(parentActive ? styles.navIconActive : {}) }}>
              <Icon size={15} />
            </span>
            <span style={styles.navText}>{item.label}</span>
            {isOpen
              ? <ChevronDown size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
              : <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            }
          </button>
          {isOpen && (
            <div style={{ paddingLeft: 16 }}>
              {visibleChildren.map((child) => {
                const ChildIcon = child.icon;
                return (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    end={Boolean(child.exact)}
                    style={({ isActive }) => ({
                      ...styles.navLink,
                      fontSize: 12,
                      paddingTop: 6,
                      paddingBottom: 6,
                      ...(isActive ? styles.navLinkActive : {}),
                    })}
                  >
                    {({ isActive }) => (
                      <>
                        <span style={{ ...styles.navIcon, ...(isActive ? styles.navIconActive : {}) }}>
                          <ChildIcon size={14} />
                        </span>
                        <span style={styles.navText}>{child.label}</span>
                        {isActive && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    const badgeCount = item.badge === 'overdue' ? overdueCount
      : item.badge === 'chatUnread' ? chatUnreadCount : 0;
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
            {badgeCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: '#dc2626', color: '#fff', borderRadius: 10,
                fontSize: 10, fontWeight: 700, minWidth: 17, height: 17,
                padding: '0 4px', marginLeft: 4, flexShrink: 0,
              }}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
            {isActive && badgeCount === 0 && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside style={styles.sidebar}>
      {/* Brand */}
      <div style={styles.brand}>
        <img src={logoUrl} alt="CA Rahul Gupta - Office Portal" style={styles.brandLogo} />
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {navSections.map((section) => (
          <div key={section.label}>
            <div style={styles.sectionLabel}>{section.label}</div>
            {section.items.map((item) => renderNavItem(item))}
          </div>
        ))}

        {/* Admin section -- only shown when user has admin access */}
        {visibleAdminItems.length > 0 && (
          <div>
            <div style={styles.sectionLabel}>ADMIN</div>
            {visibleAdminItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
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
        )}
      </nav>

      {/* User card */}
      <div style={styles.userCard}>
        <div style={styles.avatar}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{roleLabel}</div>
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
    padding: '16px 16px 14px',
    borderBottom: '1px solid #F0F2F8',
  },
  brandLogo: {
    width: '100%',
    maxWidth: 200,
    height: 'auto',
    display: 'block',
    objectFit: 'contain',
  },
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
    color: 'var(--portal-primary)',
    background: 'var(--portal-primary-tint)',
    fontWeight: 600,
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  navIconActive: { opacity: 1, color: 'var(--portal-primary)' },
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
    background: 'linear-gradient(135deg, var(--portal-primary) 0%, var(--portal-primary-light) 100%)',
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
