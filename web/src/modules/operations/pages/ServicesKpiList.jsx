import { useState, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { getEngagementsWithMeta } from '../../../services/engagementService';
import { useAuth } from '../../../auth/AuthContext';
import { isValidKpiSlug, kpiLabelFromSlug, localDateKey } from '../../../utils/serviceKpiFilters';
import ListPaginationBar from '../../../components/common/ListPaginationBar';
import ServicesEngagementTableBlock from '../../../components/services/ServicesEngagementTableBlock';

const PER_PAGE = 50;

export default function ServicesKpiList() {
  const { kpiSlug } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canDeleteService = hasPermission('services.delete');
  const canEditService = hasPermission('services.edit');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [pageServices, setPageServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!isValidKpiSlug(kpiSlug)) return;
    setLoading(true);
    getEngagementsWithMeta({
      page,
      perPage: PER_PAGE,
      search,
      kpiSlug,
      asOf: localDateKey(new Date()),
    })
      .then(({ engagements, total, lastPage }) => {
        setPageServices(engagements);
        setServerTotal(total);
        setTotalPages(Math.max(1, lastPage));
      })
      .catch(() => {
        setPageServices([]);
        setServerTotal(0);
        setTotalPages(1);
      })
      .finally(() => setLoading(false));
  }, [kpiSlug, page, search]);

  if (!isValidKpiSlug(kpiSlug)) {
    return <Navigate to="/services" replace />;
  }

  const label = kpiLabelFromSlug(kpiSlug);
  const emptyMessage = serverTotal === 0 && !loading
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
        {loading && pageServices.length === 0 && <span style={muted}>Loading…</span>}
      </div>
      <p style={subText}>Open engagements in this group; search to narrow, then use actions on each row.</p>

      <div style={toolbar}>
        <div style={searchBox}>
          <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search client or service…"
            style={searchInputStyle}
          />
        </div>
      </div>

      <div style={listCard}>
        <ListPaginationBar
          placement="top"
          total={serverTotal}
          page={page}
          totalPages={totalPages}
          perPage={PER_PAGE}
          loading={loading}
          setPage={setPage}
          entityPlural="engagements"
        />
        <ServicesEngagementTableBlock
          rows={pageServices}
          setAllServices={setPageServices}
          canEditService={canEditService}
          canDeleteService={canDeleteService}
          emptyMessage={emptyMessage}
        />
        <ListPaginationBar
          placement="bottom"
          total={serverTotal}
          page={page}
          totalPages={totalPages}
          perPage={PER_PAGE}
          loading={loading}
          setPage={setPage}
          entityPlural="engagements"
        />
      </div>
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
const searchInputStyle = { border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#334155', width: '100%' };
const listCard = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #E6E8F0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  overflow: 'hidden',
};
