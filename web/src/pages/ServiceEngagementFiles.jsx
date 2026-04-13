import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, FolderOpen, ArrowRight } from 'lucide-react';
import { getEngagement } from '../services/engagementService';

export default function ServiceEngagementFiles() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eng, setEng] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getEngagement(id)
      .then(setEng)
      .catch(e => setError(e.message || 'Could not load engagement.'))
      .finally(() => setLoading(false));
  }, [id]);

  const clientQuery = eng?.clientId != null ? `clientId=${encodeURIComponent(String(eng.clientId))}` : '';

  return (
    <div style={pageWrap}>
      <div style={breadcrumbRow}>
        <span style={crumb} onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/')}>Home</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumb} onClick={() => navigate('/services')} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/services')}>Services &amp; Tasks</span>
        <ChevronRight size={13} color="#94a3b8" />
        <span style={crumbActive}>Engagement files</span>
      </div>

      <div style={pageTitleRow}>
        <div style={iconWrap}><FolderOpen size={22} color="#C25A0A" /></div>
        <div>
          <h1 style={pageTitle}>Documents for this engagement</h1>
          <p style={pageSub}>Per-engagement file storage is not wired to the API yet. Use Document Management for uploads; we pass client context when available.</p>
        </div>
      </div>

      {loading && <div style={muted}>Loading…</div>}
      {error && <div style={errBox}>{error}</div>}

      {!loading && eng && (
        <div style={card}>
          <div style={metaGrid}>
            <div>
              <div style={metaLabel}>Client</div>
              <div style={metaValue}>{eng.clientName}</div>
            </div>
            <div>
              <div style={metaLabel}>Service</div>
              <div style={metaValue}>{eng.type || '—'}</div>
            </div>
            <div>
              <div style={metaLabel}>Financial year</div>
              <div style={metaValue}>{eng.financialYear || '—'}</div>
            </div>
            <div>
              <div style={metaLabel}>Engagement ID</div>
              <div style={{ ...metaValue, fontFamily: 'monospace', fontSize: 12 }}>{String(eng.id)}</div>
            </div>
          </div>

          <button
            type="button"
            style={btnPrimary}
            onClick={() => navigate(clientQuery ? `/documents?${clientQuery}` : '/documents')}
          >
            Open Document Management
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

const pageWrap = { padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#F6F7FB', minHeight: '100%' };
const breadcrumbRow = { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' };
const crumb = { fontSize: 12, color: '#94a3b8', fontWeight: 500, cursor: 'pointer' };
const crumbActive = { fontSize: 12, color: '#F37920', fontWeight: 600 };
const pageTitleRow = { display: 'flex', alignItems: 'flex-start', gap: 14 };
const iconWrap = {
  width: 48, height: 48, borderRadius: 12, background: '#FEF0E6',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const pageTitle = { margin: 0, fontSize: 22, fontWeight: 700, color: '#0B1F3B', lineHeight: 1.2 };
const pageSub = { margin: '8px 0 0', fontSize: 13, color: '#64748b', maxWidth: 560, lineHeight: 1.5 };
const muted = { fontSize: 13, color: '#94a3b8' };
const errBox = { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13 };
const card = {
  background: '#fff', borderRadius: 14, border: '1px solid #E6E8F0',
  padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', maxWidth: 560,
  display: 'flex', flexDirection: 'column', gap: 20,
};
const metaGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
const metaLabel = { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 };
const metaValue = { fontSize: 14, fontWeight: 600, color: '#0B1F3B' };
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '10px 18px', background: '#F37920', color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer', fontSize: 14, fontWeight: 600, boxShadow: '0 2px 8px rgba(243,121,32,0.30)', alignSelf: 'flex-start',
};
