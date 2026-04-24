import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getAllEngagements, getServiceKpiSnapshot } from '../services/engagementService';
import { useAuth } from '../auth/AuthContext';
import {
  Plus, Search, SlidersHorizontal,
  Clock, AlertTriangle,
  Info, CheckCircle2,
} from 'lucide-react';
import { KPI_SLUGS, filterEngagementsBySlug } from '../utils/serviceKpiFilters';
import ServicesEngagementTableBlock from '../components/services/ServicesEngagementTableBlock';

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
      onClick={(e) => {
        // #region agent log
        fetch('http://127.0.0.1:7926/ingest/28a79f3f-f04f-4bab-ab73-c26b190ed6e3', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9e37a5' }, body: JSON.stringify({ sessionId: '9e37a5', location: 'Services.jsx:KpiCard:click', message: 'KPI Link click', data: { to, defaultPrevented: e.defaultPrevented, tag: (e.target && e.target instanceof Element) ? e.target.tagName : String(e.target) }, timestamp: Date.now(), hypothesisId: 'A', runId: 'pre' }) }).catch(() => {});
        // #endregion
      }}
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
  const { hasPermission } = useAuth();
  const canDeleteService = hasPermission('services.delete');
  const canEditService = hasPermission('services.edit');
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [allServices, setAllServices] = useState([]);
  const [kpiSnapshot, setKpiSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandServiceId, setExpandServiceId] = useState(null);
  const onExpandConsumed = useCallback(() => setExpandServiceId(null), []);

  useEffect(() => {
    const raw = searchParams.get('openService');
    if (raw == null) return;
    if (!allServices.length) return;
    setExpandServiceId(raw);
    const next = new URLSearchParams(searchParams);
    next.delete('openService');
    setSearchParams(next, { replace: true });
  }, [searchParams, allServices, setSearchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAllEngagements().catch(() => []),
      getServiceKpiSnapshot().catch(() => null),
    ])
      .then(([data, snap]) => {
        setAllServices(data);
        setKpiSnapshot(snap);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredServices = allServices.filter((s) => {
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || s.clientName.toLowerCase().includes(q) || s.type.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const kpis = kpiData(allServices, kpiSnapshot);

  return (
    <div style={pageWrap}>
      {loading && (
        <div style={{ fontSize: 13, color: '#64748b' }}>Loading engagements…</div>
      )}
      {/* KPI row */}
      <div style={kpiRow}>
        {kpis.map((k) => (
          <KpiCard key={k.label} item={k} to={`/services/focus/${k.slug}`} />
        ))}
      </div>

      {/* Toolbar */}
      <div style={toolbar}>
        <div style={searchBox}>
          <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or service…"
            style={searchInput}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlidersHorizontal size={14} style={{ color: '#64748b' }} />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All Statuses</option>
            {['not_started', 'in_progress', 'pending_info', 'review', 'completed', 'cancelled'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
          <button type="button" style={btnPrimary} onClick={() => navigate('/services/new')}>
            <Plus size={15} />
            New Service Engagement
          </button>
        </div>
      </div>

      <ServicesEngagementTableBlock
        rows={filteredServices}
        setAllServices={setAllServices}
        canEditService={canEditService}
        canDeleteService={canDeleteService}
        allServicesForSelection={allServices}
        expandServiceId={expandServiceId}
        onExpandConsumed={onExpandConsumed}
      />
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

const toolbar = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  background: '#fff', padding: '12px 16px', borderRadius: 12,
  border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};
const searchBox = { display: 'flex', alignItems: 'center', gap: 8, background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 8, padding: '6px 10px', flex: 1, maxWidth: 300 };
const searchInput = { border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#334155', width: '100%' };

const selectStyle = { padding: '7px 12px', border: '1px solid #E6E8F0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#334155', outline: 'none', cursor: 'pointer' };
const btnPrimary = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(243,121,32,0.30)' };
