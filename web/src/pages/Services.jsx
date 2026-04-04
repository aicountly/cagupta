import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEngagements } from '../data/engagementStore';
import StatusBadge from '../components/common/StatusBadge';
import {
  Plus, Search, SlidersHorizontal,
  Pencil, FolderOpen, Clock, AlertTriangle,
  Info, CheckCircle2, TrendingUp, X,
  ChevronUp,
} from 'lucide-react';

// ── KPI helpers ──────────────────────────────────────────────────────────────
function kpiData(services) {
  const today = new Date();
  const weekAhead = new Date(today); weekAhead.setDate(today.getDate() + 7);
  return [
    {
      label: 'Due This Week',
      value: services.filter(s => { const d = new Date(s.dueDate); return d >= today && d <= weekAhead; }).length,
      icon: Clock,
      color: '#F37920',
      bg: '#FEF0E6',
      trend: '+2',
    },
    {
      label: 'Overdue',
      value: services.filter(s => new Date(s.dueDate) < today && s.status !== 'completed').length,
      icon: AlertTriangle,
      color: '#EF4444',
      bg: '#FFF1F2',
      trend: '-1',
    },
    {
      label: 'Pending Info',
      value: services.filter(s => s.status === 'pending_info').length,
      icon: Info,
      color: '#F37920',
      bg: '#FEF0E6',
      trend: '0',
    },
    {
      label: 'Completed',
      value: services.filter(s => s.status === 'completed').length,
      icon: CheckCircle2,
      color: '#55B848',
      bg: '#E8F7E6',
      trend: '+3',
    },
  ];
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ item }) {
  const Icon = item.icon;
  const trendPositive = item.trend.startsWith('+');
  const trendNeutral = item.trend === '0';
  return (
    <div style={kpiCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={kpiLabel}>{item.label}</div>
          <div style={kpiValue}>{item.value}</div>
        </div>
        <div style={{ ...kpiIconWrap, background: item.bg }}>
          <Icon size={18} color={item.color} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
        {(() => {
          const trendColor = trendNeutral ? '#94a3b8' : trendPositive ? '#22c55e' : '#ef4444';
          const trendRotate = trendNeutral ? 'rotate(90deg)' : trendPositive ? 'none' : 'rotate(180deg)';
          return <ChevronUp size={12} color={trendColor} style={{ transform: trendRotate }} />;
        })()}
        <span style={{ fontSize: 11, fontWeight: 600, color: trendNeutral ? '#94a3b8' : trendPositive ? '#22c55e' : '#ef4444' }}>
          {trendNeutral ? 'No change' : `${item.trend} this week`}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Services() {
  const navigate = useNavigate();
  const [selectedService, setSelectedService] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [hoverRow, setHoverRow] = useState(null);

  // Read from store once on mount (localStorage + mock seed).
  // The component unmounts/remounts on navigation so this stays fresh.
  const [allServices] = useState(() => getEngagements());

  const filteredServices = allServices.filter(s => {
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || s.clientName.toLowerCase().includes(q) || s.type.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const serviceTasks = selectedService
    ? (selectedService.tasks || [])
    : [];
  const completedTasks = serviceTasks.filter(t => t.status === 'done').length;
  const progress = serviceTasks.length ? Math.round((completedTasks / serviceTasks.length) * 100) : 0;

  const kpis = kpiData(allServices);

  return (
    <div style={pageWrap}>
      {/* KPI row */}
      <div style={kpiRow}>
        {kpis.map(k => <KpiCard key={k.label} item={k} />)}
      </div>

      {/* Toolbar */}
      <div style={toolbar}>
        <div style={searchBox}>
          <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client or service…"
            style={searchInput}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlidersHorizontal size={14} style={{ color: '#64748b' }} />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All Statuses</option>
            {['not_started', 'in_progress', 'pending_info', 'review', 'completed', 'cancelled'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
          <button style={btnPrimary} onClick={() => navigate('/services/new')}>
            <Plus size={15} />
            New Service Engagement
          </button>
        </div>
      </div>

      {/* Table + side panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedService ? '1fr 380px' : '1fr', gap: 16 }}>
        {/* Table card */}
        <div style={tableCard}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {['Client', 'Service', 'FY', 'Assigned To', 'Due Date', 'Fee', 'Status', 'Actions'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((s, idx) => {
                  const isActive = selectedService?.id === s.id;
                  const isHover = hoverRow === s.id;
                  const isOdd = idx % 2 === 0;
                  const isOverdue = new Date(s.dueDate) < new Date() && s.status !== 'completed';
                  let rowBg = isOdd ? '#FAFBFD' : '#ffffff';
                  if (isActive) rowBg = '#FEF0E6';
                  else if (isHover) rowBg = '#FFF5EE';
                  return (
                    <tr
                      key={s.id}
                      style={{ ...trStyle, background: rowBg, cursor: 'pointer' }}
                      onClick={() => setSelectedService(isActive ? null : s)}
                      onMouseEnter={() => setHoverRow(s.id)}
                      onMouseLeave={() => setHoverRow(null)}
                    >
                      <td style={tdStyle}>
                        <div style={clientCell}>
                          <div style={clientAvatar}>{s.clientName[0]}</div>
                          <span style={{ fontWeight: 600, color: '#0B1F3B' }}>{s.clientName}</span>
                        </div>
                      </td>
                      <td style={tdStyle}><span style={serviceTag}>{s.type}</span></td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{s.financialYear}</td>
                      <td style={tdStyle}>{s.assignedTo}</td>
                      <td style={{ ...tdStyle, color: isOverdue ? '#ef4444' : '#334155', fontWeight: isOverdue ? 600 : 400 }}>
                        {s.dueDate}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#0B1F3B' }}>₹{s.feeAgreed?.toLocaleString('en-IN')}</td>
                      <td style={tdStyle}><StatusBadge status={s.status} /></td>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <ActionBtn icon={Pencil} title="Edit" onClick={() => navigate(`/services/${s.id}/edit`)} />
                          <ActionBtn icon={FolderOpen} title="View Files" onClick={() => navigate(`/services/${s.id}/files`)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredServices.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      No service engagements match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Table footer */}
          <div style={tableFooter}>
            <span>{filteredServices.length} engagement{filteredServices.length !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Live Data</span>
          </div>
        </div>

        {/* Task side panel */}
        {selectedService && (
          <div style={sidePanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B' }}>{selectedService.type}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{selectedService.clientName} · {selectedService.financialYear}</div>
              </div>
              <button onClick={() => setSelectedService(null)} style={closeBtn}>
                <X size={14} />
              </button>
            </div>

            {/* Progress */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                <span style={{ fontWeight: 500 }}>Progress</span>
                <span style={{ fontWeight: 600, color: '#0B1F3B' }}>{completedTasks}/{serviceTasks.length} tasks</span>
              </div>
              <div style={progressTrack}>
                <div style={{ ...progressFill, width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{progress}% complete</div>
            </div>

            {/* Tasks header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#0B1F3B' }}>Tasks</span>
              <button style={btnSecondary}><Plus size={12} /> Add Task</button>
            </div>

            {serviceTasks.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No tasks yet.</div>
            )}
            {serviceTasks.map(t => (
              <div key={t.id} style={taskRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ ...taskDot, background: t.status === 'done' ? '#55B848' : t.status === 'in_progress' ? '#F37920' : '#e2e8f0', marginTop: 4, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: t.status === 'done' ? 400 : 600, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? '#94a3b8' : '#1e293b' }}>
                      {t.title}
                    </span>
                  </div>
                  <StatusBadge status={t.priority} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, paddingLeft: 20 }}>{t.assignedTo} · Due: {t.dueDate}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────
function ActionBtn({ icon: Icon, title, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...actionBtn, background: hover ? '#FEF0E6' : '#F6F7FB', borderColor: hover ? 'rgba(243,121,32,0.4)' : '#E6E8F0', color: hover ? '#F37920' : '#64748b' }}
    >
      <Icon size={13} />
    </button>
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
const btnSecondary = { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#FEF0E6', color: '#F37920', border: '1px solid rgba(243,121,32,0.35)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 };

const tableCard = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = {
  textAlign: 'left', padding: '12px 14px',
  color: '#64748b', fontWeight: 600, fontSize: 11,
  borderBottom: '2px solid #F0F2F8',
  background: '#F8FAFC',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  position: 'sticky', top: 0, zIndex: 1,
};
const tdStyle = { padding: '12px 14px', color: '#334155', verticalAlign: 'middle', whiteSpace: 'nowrap', borderBottom: '1px solid #F0F2F8' };
const trStyle = { transition: 'background 0.12s' };

const clientCell = { display: 'flex', alignItems: 'center', gap: 9 };
const clientAvatar = {
  width: 28, height: 28, borderRadius: 8,
  background: 'linear-gradient(135deg, #F37920 0%, #f5a623 100%)',
  color: '#fff', fontWeight: 700, fontSize: 11,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};
const serviceTag = {
  background: '#FEF0E6', color: '#C25A0A',
  padding: '2px 8px', borderRadius: 5,
  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
};
const actionBtn = {
  width: 28, height: 28,
  border: '1px solid',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
  padding: 0,
};
const tableFooter = {
  padding: '10px 16px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderTop: '1px solid #F0F2F8',
  fontSize: 12, color: '#94a3b8', fontWeight: 500,
};

const sidePanel = { background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20, overflowY: 'auto', alignSelf: 'start' };
const closeBtn = { background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 6, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 };
const progressTrack = { height: 7, background: '#E6E8F0', borderRadius: 99, overflow: 'hidden' };
const progressFill = { height: '100%', background: 'linear-gradient(90deg, #55B848 0%, #7dcc72 100%)', borderRadius: 99, transition: 'width 0.4s ease' };
const taskRow = { padding: '10px 0', borderBottom: '1px solid #F6F7FB' };
const taskDot = { width: 8, height: 8, borderRadius: '50%' };
