import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Target, UserRound, Building2, ShieldCheck,
  Search, ArrowRight, BarChart3,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const REPORT_CATEGORIES = [
  {
    id: 'timesheets',
    label: 'Timesheets',
    description: 'Staff attendance, working hours, and shift performance',
    reports: [
      {
        id: 'timesheet',
        label: 'Timesheet Report',
        description: 'View and export staff attendance and working hours by date range.',
        icon: Clock,
        to: '/reports/timesheets',
        permission: 'services.view',
      },
      {
        id: 'shift-target',
        label: 'Staff Punch vs Target',
        description: 'Compare actual punch-in/out times against scheduled shift targets.',
        icon: Target,
        to: '/reports/timesheets/shift-target',
        permission: 'services.view',
      },
    ],
  },
  {
    id: 'exceptions',
    label: 'Data Exceptions',
    description: 'Identify contacts and organizations with missing or incomplete data',
    reports: [
      {
        id: 'contact-exceptions',
        label: 'Contact Exceptions',
        description: 'Contacts with incomplete or missing mandatory profile information.',
        icon: UserRound,
        to: '/reports/exceptions/contacts',
        permission: 'clients.view',
      },
      {
        id: 'org-exceptions',
        label: 'Organization Exceptions',
        description: 'Organizations with incomplete or missing mandatory profile information.',
        icon: Building2,
        to: '/reports/exceptions/organizations',
        permission: 'clients.view',
      },
      {
        id: 'contact-kyc',
        label: 'Contact KYC Exceptions',
        description: 'Contacts with missing, expired, or unverified KYC documents.',
        icon: ShieldCheck,
        to: '/reports/exceptions/contact-kyc',
        permission: 'clients.view',
      },
      {
        id: 'org-kyc',
        label: 'Organization KYC Exceptions',
        description: 'Organizations with missing, expired, or unverified KYC documents.',
        icon: ShieldCheck,
        to: '/reports/exceptions/organization-kyc',
        permission: 'clients.view',
      },
    ],
  },
];

export default function ReportsHub() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REPORT_CATEGORIES
      .map((cat) => ({
        ...cat,
        reports: cat.reports.filter((r) => {
          if (r.permission && !hasPermission(r.permission)) return false;
          if (!q) return true;
          return (
            r.label.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            cat.label.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((cat) => cat.reports.length > 0);
  }, [query, hasPermission]);

  const totalVisible = filteredCategories.reduce((n, c) => n + c.reports.length, 0);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <BarChart3 size={28} color="#F37920" />
        </div>
        <div>
          <h1 style={styles.headerTitle}>Reports</h1>
          <p style={styles.headerSub}>
            Select a report below to view and export data.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div style={styles.searchWrap}>
        <Search size={15} style={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search reports…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.searchInput}
        />
        {query && (
          <button style={styles.clearBtn} onClick={() => setQuery('')} type="button">
            ✕
          </button>
        )}
      </div>

      {/* Results */}
      {filteredCategories.length === 0 ? (
        <div style={styles.empty}>
          <Search size={36} color="#cbd5e1" />
          <p style={{ marginTop: 12, color: '#94a3b8', fontSize: 14 }}>
            No reports match &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <>
          {query && (
            <p style={styles.resultCount}>
              {totalVisible} result{totalVisible !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
            </p>
          )}
          {filteredCategories.map((cat) => (
            <section key={cat.id} style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>{cat.label}</span>
                <span style={styles.sectionDesc}>{cat.description}</span>
              </div>
              <div style={styles.grid}>
                {cat.reports.map((report) => {
                  const Icon = report.icon;
                  return (
                    <button
                      key={report.id}
                      type="button"
                      style={styles.card}
                      onClick={() => navigate(report.to)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(243,121,32,0.13)';
                        e.currentTarget.style.borderColor = '#F37920';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = styles.card.boxShadow;
                        e.currentTarget.style.borderColor = styles.card.borderColor;
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <div style={styles.cardIconWrap}>
                        <Icon size={20} color="#F37920" />
                      </div>
                      <div style={styles.cardBody}>
                        <div style={styles.cardTitle}>{report.label}</div>
                        <div style={styles.cardDesc}>{report.description}</div>
                      </div>
                      <ArrowRight size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: '32px 36px',
    maxWidth: 960,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: '#FEF0E6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#1e293b',
  },
  headerSub: {
    margin: '3px 0 0',
    fontSize: 13,
    color: '#64748b',
  },
  searchWrap: {
    position: 'relative',
    marginBottom: 32,
    maxWidth: 420,
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '10px 36px 10px 36px',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    fontSize: 13,
    color: '#1e293b',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  clearBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 1,
    padding: 2,
  },
  resultCount: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 20,
    marginTop: -20,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 60,
  },
  section: {
    marginBottom: 36,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    display: 'block',
    marginBottom: 2,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#94a3b8',
    display: 'block',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 14,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    background: '#fff',
    border: '1px solid #e8ecf3',
    borderRadius: 12,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.15s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    borderColor: '#e8ecf3',
  },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    background: '#FEF0E6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.4,
  },
};
