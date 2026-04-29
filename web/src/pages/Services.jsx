import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getAllEngagements, getServiceKpiSnapshot } from '../services/engagementService';
import { getMyTemporaryCharges } from '../services/leaveService';
import { useAuth } from '../auth/AuthContext';
import { useStaffUsers } from '../hooks/useStaffUsers';
import {
  Plus, Search, SlidersHorizontal,
  Clock, AlertTriangle,
  Info, CheckCircle2, Briefcase,
} from 'lucide-react';
import { KPI_SLUGS, filterEngagementsBySlug } from '../utils/serviceKpiFilters';
import ServicesEngagementTableBlock from '../components/services/ServicesEngagementTableBlock';

const PENDING_ON_ME_FILTER = 'pending_on_me';
const PENDING_ON_ME_STATUSES = ['not_started', 'in_progress', 'pending_info', 'review'];
const TAB_ALL   = 'all';
const TAB_TEMP  = 'temp_charge';

function formatWeekLine(delta, mode) {
  if (mode === 'activity_7d') {
    return delta > 0 ? `+${delta} this week` : 'No change';
  }
  if (delta > 0) return `+${delta} this week`;
  if (delta < 0) return `${delta} this week`;
  return 'No change';
}

// ── KPI helpers (engagement-level due date; not per-task JSON lines) ───────
function kpiData(services, snapshot) {
  const defs = [
    {
      label: 'Due This Week',
      slug: KPI_SLUGS.DUE_WEEK,
      icon: Clock,
      color: '#F37920',
      bg: '#FEF0E6',
      subtitle: 'Open engagements · engagement due date in next 7 days',
    },
    {
      label: 'Overdue',
      slug: KPI_SLUGS.OVERDUE,
      icon: AlertTriangle,
      color: '#EF4444',
      bg: '#FFF1F2',
      subtitle: 'Open engagements · past engagement due date',
    },
    {
      label: 'Pending Info',
      slug: KPI_SLUGS.PENDING_INFO,
      icon: Info,
      color: '#F37920',
      bg: '#FEF0E6',
      subtitle: 'By engagement status',
    },
    {
      label: 'Completed',
      slug: KPI_SLUGS.COMPLETED,
      icon: CheckCircle2,
      color: '#55B848',
      bg: '#E8F7E6',
      subtitle: 'By engagement status',
    },
  ];

  return defs.map((row) => {
    const useApi = snapshot && typeof snapshot.counts?.[row.slug] === 'number';
    const value = useApi
      ? snapshot.counts[row.slug]
      : filterEngagementsBySlug(services, row.slug).length;
    const weekLine = snapshot
      ? formatWeekLine(
          snapshot.weekDelta[row.slug],
          snapshot.weekDeltaMode[row.slug]
        )
      : null;
    return { ...row, value, weekLine };
  });
}

// ── KPI Card (Link for middle-click / reliable navigation) ───────────────────
function KpiCard({ item, to }) {
  const Icon = item.icon;
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
      style={{
        ...kpiCard,
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        cursor: 'pointer',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.05)',
        borderColor: hover ? 'rgba(243,121,32,0.35)' : '#E6E8F0',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      aria-label={`${item.label}, ${item.value} engagements. Open list.`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
          <div style={kpiLabel}>{item.label}</div>
          <div style={kpiValue}>{item.value}</div>
          {item.weekLine != null && (
            <div style={kpiWeekLine}>{item.weekLine}</div>
          )}
          <div style={kpiSubtitle}>{item.subtitle}</div>
        </div>
        <div style={{ ...kpiIconWrap, background: item.bg, flexShrink: 0 }}>
          <Icon size={18} color={item.color} />
        </div>
      </div>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Services() {
  const navigate = useNavigate();
  const { hasPermission, user } = useAuth();
  const isSuperAdmin = String(user?.email || '').toLowerCase() === 'rahul@cagupta.in';
  const { staffUsers } = useStaffUsers();
  const canDeleteService = hasPermission('services.delete');
  const canEditService = hasPermission('services.edit');
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(TAB_ALL);
  const [scopeUserId, setScopeUserId] = useState('');
  const [filterStatus, setFilterStatus] = useState(PENDING_ON_ME_FILTER);
  const [search, setSearch] = useState('');
  const [allServices, setAllServices] = useState([]);
  const [kpiSnapshot, setKpiSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandServiceId, setExpandServiceId] = useState(null);
  const onExpandConsumed = useCallback(() => setExpandServiceId(null), []);

  // Temporary charge state
  const [tempCharges, setTempCharges] = useState([]);
  const [tempChargesLoaded, setTempChargesLoaded] = useState(false);

  useEffect(() => {
    const raw = searchParams.get('openService');
    if (raw == null) return;
    if (!allServices.length) return;
    setExpandServiceId(raw);
    const next = new URLSearchParams(searchParams);
    next.delete('openService');
    setSearchParams(next, { replace: true });
  }, [searchParams, allServices, setSearchParams]);

  // Load temporary charges once on mount (only for non-super-admin staff)
  useEffect(() => {
    getMyTemporaryCharges()
      .then((charges) => {
        setTempCharges(charges);
        setTempChargesLoaded(true);
      })
      .catch(() => setTempChargesLoaded(true));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAllEngagements({
        userId: isSuperAdmin && scopeUserId ? Number(scopeUserId) : null,
      }).catch(() => []),
      getServiceKpiSnapshot({
        userId: isSuperAdmin && scopeUserId ? Number(scopeUserId) : null,
      }).catch(() => null),
    ])
      .then(([data, snap]) => {
        setAllServices(data);
        setKpiSnapshot(snap);
      })
      .finally(() => setLoading(false));
  }, [isSuperAdmin, scopeUserId]);

  const selectableUsers = useMemo(() => {
    return staffUsers
      .filter((s) => Number(s.id) > 0)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [staffUsers]);

  const kpis = kpiData(allServices, kpiSnapshot);
  const hasTempCharges = tempChargesLoaded && tempCharges.length > 0;

  const filteredServices = allServices.filter((s) => {
    const matchStatus = filterStatus === 'all'
      || (filterStatus === PENDING_ON_ME_FILTER
        ? PENDING_ON_ME_STATUSES.includes(s.status)
        : s.status === filterStatus);
    const q = search.toLowerCase();
    const matchSearch = !q || s.clientName.toLowerCase().includes(q) || s.type.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div style={pageWrap}>
      {loading && (
        <div style={{ fontSize: 13, color: '#64748b' }}>Loading engagements…</div>
      )}
      {/* KPI row — only shown on the main tab */}
      {activeTab === TAB_ALL && (
        <div style={kpiRow}>
          {kpis.map((k) => (
            <KpiCard key={k.label} item={k} to={`/services/focus/${k.slug}`} />
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={tabBarWrap}>
        <div style={tabBar}>
          <button
            type="button"
            onClick={() => setActiveTab(TAB_ALL)}
            style={{ ...tabBtn, ...(activeTab === TAB_ALL ? tabBtnActive : {}) }}
          >
            All Services
          </button>
          {hasTempCharges && (
            <button
              type="button"
              onClick={() => setActiveTab(TAB_TEMP)}
              style={{ ...tabBtn, ...(activeTab === TAB_TEMP ? tabBtnActive : {}) }}
            >
              <Briefcase size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
              Temporary Charge
              <span style={tempBadge}>{tempCharges.length}</span>
            </button>
          )}
        </div>

        {/* Toolbar (only for main tab) */}
        {activeTab === TAB_ALL && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={searchBox}>
              <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client or service…"
                style={searchInput}
              />
            </div>
            {isSuperAdmin && (
              <select
                value={scopeUserId}
                onChange={(e) => setScopeUserId(e.target.value)}
                style={selectStyle}
              >
                <option value="">All Users</option>
                {selectableUsers.map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            )}
            <SlidersHorizontal size={14} style={{ color: '#64748b' }} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Statuses</option>
              <option value={PENDING_ON_ME_FILTER}>Pending with me</option>
              {['not_started', 'in_progress', 'pending_info', 'review', 'completed', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
            <button type="button" style={btnPrimary} onClick={() => navigate('/services/new')}>
              <Plus size={15} />
              New Service Engagement
            </button>
          </div>
        )}
      </div>

      {/* All Services tab content */}
      {activeTab === TAB_ALL && (
        <ServicesEngagementTableBlock
          rows={filteredServices}
          setAllServices={setAllServices}
          canEditService={canEditService}
          canDeleteService={canDeleteService}
          allServicesForSelection={allServices}
          expandServiceId={expandServiceId}
          onExpandConsumed={onExpandConsumed}
        />
      )}

      {/* Temporary Charge tab content */}
      {activeTab === TAB_TEMP && (
        <TempChargeView charges={tempCharges} />
      )}
    </div>
  );
}

// ── Temporary Charge view ─────────────────────────────────────────────────────

function TempChargeView({ charges }) {
  // Group by original_user_name (the employee on leave)
  const grouped = {};
  charges.forEach((c) => {
    const key = c.original_user_name || 'Unknown Employee';
    if (!grouped[key]) grouped[key] = { user: key, leaveEnd: c.leave_end, items: [] };
    grouped[key].items.push(c);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.values(grouped).map((group) => (
        <div key={group.user} style={tempCard}>
          <div style={tempCardHeader}>
            <Briefcase size={16} color="#F37920" />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#0B1F3B' }}>
                Covering for {group.user}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 12 }}>
                until {group.leaveEnd}
              </span>
            </div>
            <span style={tempBanner}>Temporary Charge</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <thead>
              <tr>
                {['Service', 'Client', 'Status', 'Due Date', 'Action'].map((h) => (
                  <th key={h} style={tempTh}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.items.map((c) => (
                <tr key={c.id}>
                  <td style={tempTd}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3B' }}>
                      {c.service_type}
                    </div>
                    {c.financial_year && (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.financial_year}</div>
                    )}
                  </td>
                  <td style={tempTd}><span style={{ fontSize: 13 }}>{c.client_name}</span></td>
                  <td style={tempTd}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 8,
                      fontSize: 11, fontWeight: 600,
                      background: c.service_status === 'in_progress' ? '#dbeafe' : '#f1f5f9',
                      color:      c.service_status === 'in_progress' ? '#1d4ed8' : '#475569',
                    }}>
                      {(c.service_status || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={tempTd}>
                    <span style={{ fontSize: 13, color: c.due_date ? '#0B1F3B' : '#94a3b8' }}>
                      {c.due_date || '—'}
                    </span>
                  </td>
                  <td style={tempTd}>
                    <Link
                      to={`/services/${c.service_id}`}
                      style={{
                        fontSize: 12, fontWeight: 600, color: '#F37920',
                        textDecoration: 'none',
                      }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const kpiRow = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 };
const kpiCard = {
  background: '#fff',
  borderRadius: 14,
  padding: '18px 20px',
  border: '1px solid #E6E8F0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};
const kpiLabel = { fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
const kpiValue = { fontSize: 30, fontWeight: 700, color: '#0B1F3B', lineHeight: 1 };
const kpiWeekLine = { fontSize: 12, fontWeight: 600, color: '#0B1F3B', marginTop: 4 };
const kpiSubtitle = { fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.35 };
const kpiIconWrap = { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

const tabBarWrap = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  background: '#fff', padding: '10px 16px', borderRadius: 12,
  border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  flexWrap: 'wrap',
};
const tabBar = { display: 'flex', gap: 4, alignItems: 'center' };
const tabBtn = {
  padding: '7px 16px', border: '1px solid transparent', borderRadius: 8,
  background: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
};
const tabBtnActive = {
  background: '#FEF0E6', color: '#F37920', border: '1px solid rgba(243,121,32,0.25)',
};
const tempBadge = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: '#F37920', color: '#fff', borderRadius: 10,
  fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px',
  marginLeft: 6,
};

const searchBox = { display: 'flex', alignItems: 'center', gap: 8, background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 8, padding: '6px 10px', maxWidth: 260 };
const searchInput = { border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#334155', width: '100%' };

const selectStyle = { padding: '7px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#334155', outline: 'none', cursor: 'pointer' };
const btnPrimary = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(243,121,32,0.30)' };

const tempCard = {
  background: '#fff', borderRadius: 14, border: '1px solid #FBD5B5',
  overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};
const tempCardHeader = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '14px 18px', background: '#FEF7F1', borderBottom: '1px solid #FBD5B5',
};
const tempBanner = {
  fontSize: 11, fontWeight: 700, color: '#F37920',
  background: '#FEF0E6', border: '1px solid rgba(243,121,32,0.3)',
  borderRadius: 8, padding: '2px 10px',
};
const tempTh = {
  textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  padding: '8px 16px', borderBottom: '1px solid #E6E8F0',
};
const tempTd = { padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' };
