import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const METRIC_DETAIL_CONFIG = {
  general: {
    title: 'Dashboard Metric Details',
    description: 'No dedicated page exists for this metric yet. Use quick links below to continue.',
  },
};

const QUICK_LINKS = [
  { label: 'Clients', path: '/clients/contacts' },
  { label: 'Services', path: '/services' },
  { label: 'Invoices', path: '/invoices' },
  { label: 'Documents', path: '/documents' },
  { label: 'Calendar', path: '/calendar' },
];

export default function DashboardMetricDetail() {
  const navigate = useNavigate();
  const { metricKey } = useParams();
  const detail = useMemo(() => METRIC_DETAIL_CONFIG[metricKey] || METRIC_DETAIL_CONFIG.general, [metricKey]);

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <h1 style={h1}>{detail.title}</h1>
        <p style={mutedText}>{detail.description}</p>
        <div style={linkGrid}>
          {QUICK_LINKS.map((link) => (
            <button key={link.path} type="button" style={actionBtn} onClick={() => navigate(link.path)}>
              Open {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const pageWrap = { padding: 24, background: '#F6F7FB', minHeight: '100%' };
const cardStyle = { background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #E6E8F0', boxShadow: '0 1px 4px rgba(0,0,0,.06)', maxWidth: 720 };
const h1 = { fontSize: 20, margin: 0, color: '#0f172a' };
const mutedText = { marginTop: 8, marginBottom: 16, color: '#64748b', fontSize: 14 };
const linkGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 };
const actionBtn = { padding: '10px 12px', background: '#F6F7FB', border: '1px solid #E6E8F0', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#334155', textAlign: 'left' };
