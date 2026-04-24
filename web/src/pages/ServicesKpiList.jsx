import { useState, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { getAllEngagements } from '../services/engagementService';
import { useAuth } from '../auth/AuthContext';
import { isValidKpiSlug, filterEngagementsBySlug, kpiLabelFromSlug } from '../utils/serviceKpiFilters';
import ServicesEngagementTableBlock from '../components/services/ServicesEngagementTableBlock';

export default function ServicesKpiList() {
  const { kpiSlug } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canDeleteService = hasPermission('services.delete');
  const canEditService = hasPermission('services.edit');
  const [allServices, setAllServices] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7926/ingest/28a79f3f-f04f-4bab-ab73-c26b190ed6e3', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9e37a5' }, body: JSON.stringify({ sessionId: '9e37a5', location: 'ServicesKpiList.jsx:mount', message: 'KpiList effect', data: { kpiSlug: String(kpiSlug ?? ''), slugValid: isValidKpiSlug(String(kpiSlug ?? '')) }, timestamp: Date.now(), hypothesisId: 'C', runId: 'pre' }) }).catch(() => {});
    // #endregion
  }, [kpiSlug]);

  useEffect(() => {
    setLoading(true);
    getAllEngagements()
      .then((data) => setAllServices(data))
      .catch(() => setAllServices([]))
      .finally(() => setLoading(false));
  }, []);

  const byKpi = filterEngagementsBySlug(allServices, kpiSlug);
  const rows = byKpi.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.clientName.toLowerCase().includes(q) || s.type.toLowerCase().includes(q);
  });

  if (!isValidKpiSlug(kpiSlug)) {
    return <Navigate to="/services" replace />;
  }

  const label = kpiLabelFromSlug(kpiSlug);
  const emptyMessage = byKpi.length === 0
    ? 'No service engagements in this list.'
    : 'No results for your search.';

  return (
    <div style={pageWrap}>
      <div style={headerBlock}>
        <button type="button" onClick={() => navigate('/services')} style={backBtn}>
          <ArrowLeft size={16} />
          Back to Services &amp; Tasks
        </button>
        <h1 style={h1}>{label}</h1>
        {loading && <span style={muted}>Loading…</span>}
      </div>
      <p style={subText}>Open engagements in this group; search to narrow, then use actions on each row.</p>

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
      </div>

      <ServicesEngagementTableBlock
        rows={rows}
        setAllServices={setAllServices}
        canEditService={canEditService}
        canDeleteService={canDeleteService}
        emptyMessage={emptyMessage}
        allServicesForSelection={allServices}
      />
    </div>
  );
}

const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, background: '#F6F7FB', minHeight: '100%' };
const headerBlock = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 };
const backBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 0',
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#F37920', fontSize: 13, fontWeight: 600,
};
const h1 = { fontSize: 20, fontWeight: 700, color: '#0B1F3B', margin: 0 };
const muted = { fontSize: 13, color: '#64748b' };
const subText = { fontSize: 13, color: '#64748b', margin: 0 };
const toolbar = {
  display: 'flex', alignItems: 'center', gap: 12,
  background: '#fff', padding: '12px 16px', borderRadius: 12,
  border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', maxWidth: 420,
};
const searchBox = { display: 'flex', alignItems: 'center', gap: 8, background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 8, padding: '6px 10px', flex: 1, width: '100%' };
const searchInput = { border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#334155', width: '100%' };
