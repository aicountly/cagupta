import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import logoUrl from '../../assets/cropped_logo.png';
import { useAuth } from '../../auth/AuthContext';
import { getInitials } from '../../utils/getInitials';
import { getOverdueFollowUpCount } from '../../services/serviceLogService';
import {
  LayoutDashboard, Users, ClipboardList, FolderOpen,
  Receipt, CalendarDays, KeyRound, BookOpen, Clock,
  Target, Settings, ChevronRight, ChevronDown,
  UserRound, Building2, ShieldCheck, Layers, Handshake, BarChart3, CalendarOff, Bell, RefreshCw,
} from 'lucide-react';

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
      {
        label: 'Reports',
        icon: BarChart3,
        navKey: 'reports',
        children: [
          { to: '/reports/timesheets', label: 'Timesheet report', icon: Clock, permission: 'services.view' },
          { to: '/reports/timesheets/shift-target', label: 'Staff punch vs target', icon: Target, permission: 'services.view' },
          { to: '/reports/exceptions/contacts', label: 'Contact exceptions', icon: UserRound, permission: 'clients.view' },
          { to: '/reports/exceptions/organizations', label: 'Organization exceptions', icon: Building2, permission: 'clients.view' },
          { to: '/reports/exceptions/contact-kyc', label: 'Contact KYC exceptions', icon: ShieldCheck, permission: 'clients.view' },
          { to: '/reports/exceptions/organization-kyc', label: 'Organization KYC exceptions', icon: ShieldCheck, permission: 'clients.view' },
        ],
      },
      { to: '/services', label: 'Services & Tasks', icon: ClipboardList },
      { to: '/services/follow-ups', label: 'Pending Follow-ups', icon: Bell, permission: 'services.view', badge: 'overdue' },
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
      { to: '/recurring-services', label: 'Recurring Services', icon: RefreshCw },
      { to: '/leads', label: 'Leads & Quotations', icon: Target },
    ],
  },
  {
    label: 'SYSTEM',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
];

/** Team admin: full manage or delegated (staff/viewer) invites */
const adminNavItems = [
  { to: '/admin/users',   label: 'User Management',  icon: ShieldCheck,  anyOf: ['users.manage', 'users.delegate'] },
  { to: '/admin/leaves',  label: 'Leave Management', icon: CalendarOff,  permission: 'users.manage' },
  { to: '/admin/affiliates', label: 'Affiliates',    icon: Handshake,    permission: 'affiliates.manage' },
];

export default function Sidebar() {
  const loc = useLocation();
  const { session, hasPermission, hasAnyPermission } = useAuth();
  const isClientsActive = loc.pathname.startsWith('/clients');
  const isReportsActive = loc.pathname.startsWith('/reports');
  const [clientsOpen, setClientsOpen] = useState(isClientsActive);
  /** Default expanded so report links (incl. punch vs target) are visible without an extra click. */
  const [reportsOpen, setReportsOpen] = useState(true);
  const [overdueCount, setOverdueCount] = useState(0);

  const user = session?.user;
  const displayName = user?.name || 'CA Rahul Gupta';
  const initials = user?.initials || getInitials(displayName);
  const roleName = user?.role || '';

  // Fetch overdue follow-up count for badge (only for staff with services.view)
  useEffect(() => {
    if (!hasPermission('services.view')) return;
    getOverdueFollowUpCount()
      .then(setOverdueCount)
      .catch(() => setOverdueCount(0));
  }, [hasPermission]);

  // Keep the sub-menu open whenever navigating to a /clients/* route
  useEffect(() => {
    if (isClientsActive) setClientsOpen(true);
  }, [isClientsActive]);

  useEffect(() => {
    if (isReportsActive) setReportsOpen(true);
  }, [isReportsActive]);

  // Build admin section if user has any admin items visible
  const visibleAdminItems = adminNavItems.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.anyOf && !hasAnyPermission(item.anyOf)) return false;
    return true;
  });

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
            {section.items.map((item) => {
              const Icon = item.icon;
              if (item.permission && !hasPermission(item.permission)) {
                return null;
              }

              // Clients: render as expandable parent with sub-items
              if (item.children) {
                const navKey = item.navKey || 'clients';
                const parentActive = navKey === 'reports' ? isReportsActive : isClientsActive;
                const subOpen = navKey === 'reports' ? reportsOpen : clientsOpen;
                const setSubOpen = navKey === 'reports' ? setReportsOpen : setClientsOpen;
                const visibleChildren = item.children.filter(
                  (ch) => !ch.permission || hasPermission(ch.permission),
                );
                if (visibleChildren.length === 0) {
                  return null;
                }
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      onClick={() => setSubOpen((v) => !v)}
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
                      {subOpen
                        ? <ChevronDown size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                        : <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                      }
                    </button>
                    {subOpen && (
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

              const badgeCount = item.badge === 'overdue' ? overdueCount : 0;
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
            })}
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
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{roleName || 'User'}</div>
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
