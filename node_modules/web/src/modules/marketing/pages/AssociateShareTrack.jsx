import { useState, useEffect } from 'react';
import { Link2, Copy, Check, Users, BarChart2, ExternalLink, AlertCircle } from 'lucide-react';
import { getAssociatesAdmin } from '../../associate/services/associateAdminService';
import { fetchTrafficSources } from '../services/traffic.service';

const SITE_URL = 'https://carahulgupta.in';

const UTM_MEDIUMS = [
  { label: 'Referral (default)', value: 'referral' },
  { label: 'Social', value: 'social' },
  { label: 'Email', value: 'email' },
  { label: 'WhatsApp', value: 'whatsapp' },
];

const LANDING_PAGES = [
  { label: 'Home page',    value: '/' },
  { label: 'Services',     value: '/services' },
  { label: 'Contact form', value: '/contact' },
  { label: 'Blog',         value: '/blog' },
  { label: 'About',        value: '/about' },
];

function buildUtmUrl(associateId, associateName, medium, landingPath) {
  if (!associateId) return '';
  const slug = String(associateName || associateId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);
  const params = new URLSearchParams({
    utm_source:   'associate',
    utm_medium:   medium,
    utm_campaign: `assoc_${associateId}`,
    utm_content:  slug,
  });
  return `${SITE_URL}${landingPath}?${params.toString()}`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore clipboard errors */
    }
  }

  return (
    <button type="button" style={s.copyBtn} onClick={handleCopy} disabled={!text} title="Copy URL">
      {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function AssociateShareTrack() {
  const [associates, setAssociates] = useState([]);
  const [selected,   setSelected]   = useState('');
  const [medium,     setMedium]     = useState('referral');
  const [landing,    setLanding]    = useState('/');
  const [loading,    setLoading]    = useState(true);
  const [sources,    setSources]    = useState(null);
  const [error,      setError]      = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [aff, src] = await Promise.all([
          getAssociatesAdmin({ status: 'approved', perPage: 200 }),
          fetchTrafficSources({ days: 30 }).catch(() => null),
        ]);
        setAssociates(aff);
        if (src) setSources((src.data ?? src)?.channels ?? []);
      } catch (e) {
        setError(e.message || 'Failed to load associates.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedAssociate = associates.find((a) => String(a.id) === String(selected));
  const utmUrl = selected
    ? buildUtmUrl(selected, selectedAssociate?.name, medium, landing)
    : '';

  const referralChannel = sources?.find((c) =>
    c.channel.toLowerCase().includes('referral')
  );

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerIcon}><Link2 size={22} color="var(--portal-primary)" /></div>
        <div>
          <h1 style={s.pageTitle}>Associate Share &amp; Track</h1>
          <p style={s.pageSub}>
            Generate UTM-tagged links for each associate and monitor referral traffic.
          </p>
        </div>
      </div>

      {error && (
        <div style={s.errorBox}>
          <AlertCircle size={15} color="#dc2626" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary card */}
      {referralChannel && (
        <div style={s.summaryCard}>
          <div style={s.summaryItem}>
            <BarChart2 size={18} color="var(--portal-primary)" />
            <div>
              <div style={s.summaryNum}>{referralChannel.sessions?.toLocaleString('en-IN')}</div>
              <div style={s.summaryLabel}>Referral sessions (30 days)</div>
            </div>
          </div>
          <div style={s.summaryItem}>
            <Users size={18} color="#2563eb" />
            <div>
              <div style={{ ...s.summaryNum, color: '#2563eb' }}>{associates.length}</div>
              <div style={s.summaryLabel}>Active associates</div>
            </div>
          </div>
          <div style={s.summaryItem}>
            <BarChart2 size={18} color="#16a34a" />
            <div>
              <div style={{ ...s.summaryNum, color: '#16a34a' }}>{referralChannel.pct}%</div>
              <div style={s.summaryLabel}>of total traffic</div>
            </div>
          </div>
        </div>
      )}

      <div style={s.twoCol}>
        {/* Link generator */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Generate Trackable Link</h2>

          <div style={s.fieldGroup}>
            <label style={s.label}>Associate</label>
            <select
              style={s.select}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={loading}
            >
              <option value="">— Select associate —</option>
              {associates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>Medium</label>
            <select style={s.select} value={medium} onChange={(e) => setMedium(e.target.value)}>
              {UTM_MEDIUMS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>Landing page</label>
            <select style={s.select} value={landing} onChange={(e) => setLanding(e.target.value)}>
              {LANDING_PAGES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {utmUrl && (
            <div style={s.urlBox}>
              <div style={s.urlLabel}>Generated URL</div>
              <div style={s.urlText}>{utmUrl}</div>
              <div style={s.urlActions}>
                <CopyButton text={utmUrl} />
                <a href={utmUrl} target="_blank" rel="noreferrer" style={s.previewLink}>
                  <ExternalLink size={13} /> Preview
                </a>
              </div>
            </div>
          )}

          {utmUrl && (
            <div style={s.utmBreakdown}>
              <div style={s.utmTitle}>UTM Parameters</div>
              {[
                ['utm_source',   'associate'],
                ['utm_medium',   medium],
                ['utm_campaign', `assoc_${selected}`],
                ['utm_content',  selectedAssociate?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) ?? ''],
              ].map(([k, v]) => (
                <div key={k} style={s.utmRow}>
                  <span style={s.utmKey}>{k}</span>
                  <span style={s.utmVal}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* How to use */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>How to Use</h2>
          <ol style={s.howToList}>
            {[
              'Select an associate from the dropdown.',
              'Choose the medium (how the associate will share — social, WhatsApp, email, etc.).',
              'Pick a landing page (usually Home or Services).',
              'Copy the generated URL and share it with the associate via WhatsApp or email.',
              'When visitors arrive via this link, GA4 automatically attributes the session to that associate campaign.',
              'View referral traffic breakdown in the Traffic Analytics dashboard.',
            ].map((step, idx) => (
              <li key={idx} style={s.howToItem}>
                <span style={s.howToNum}>{idx + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div style={s.tipBox}>
            <div style={s.tipTitle}>Tracking tip</div>
            <p style={s.tipBody}>
              In the <strong>Traffic Analytics</strong> dashboard, filter by the{' '}
              <em>Referral</em> channel to see combined associate traffic. For per-associate
              attribution, use GA4's Acquisition report and filter by{' '}
              <code>utm_campaign</code> matching <code>assoc_&#123;id&#125;</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Associate table */}
      {associates.length > 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>All Active Associates — Quick Links</h2>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Associate</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Trackable URL (Home)</th>
                <th style={s.th}>Copy</th>
              </tr>
            </thead>
            <tbody>
              {associates.map((aff, idx) => {
                const url = buildUtmUrl(aff.id, aff.name, 'referral', '/');
                return (
                  <tr key={aff.id} style={idx % 2 === 0 ? s.trEven : {}}>
                    <td style={s.td}>{aff.name}</td>
                    <td style={{ ...s.td, color: '#64748b', fontSize: 12 }}>{aff.email}</td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11 }}>
                      <span style={{ wordBreak: 'break-all' }}>{url}</span>
                    </td>
                    <td style={s.td}>
                      <CopyButton text={url} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: '28px 32px', maxWidth: 1100 },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 },
  headerIcon: {
    width: 48, height: 48, borderRadius: 12,
    background: 'var(--portal-primary-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' },
  pageSub:   { margin: '3px 0 0', fontSize: 13, color: '#64748b' },
  errorBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: '#dc2626',
  },
  summaryCard: {
    display: 'flex', gap: 24, background: '#fff',
    border: '1px solid #e8ecf3', borderRadius: 12, padding: '16px 24px',
    marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', flexWrap: 'wrap',
  },
  summaryItem: { display: 'flex', alignItems: 'center', gap: 12 },
  summaryNum:  { fontSize: 24, fontWeight: 800, color: 'var(--portal-primary)', lineHeight: 1 },
  summaryLabel:{ fontSize: 12, color: '#64748b', marginTop: 2 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, marginBottom: 16 },
  card: {
    background: '#fff', border: '1px solid #e8ecf3', borderRadius: 12,
    padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16,
  },
  cardTitle: { margin: '0 0 18px', fontSize: 14, fontWeight: 700, color: '#1e293b' },
  fieldGroup: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 },
  select: {
    width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer',
    boxSizing: 'border-box',
  },
  urlBox: {
    marginTop: 18, background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '14px 16px',
  },
  urlLabel: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
  urlText:  { fontSize: 12, fontFamily: 'monospace', color: '#0f172a', wordBreak: 'break-all', lineHeight: 1.5, marginBottom: 10 },
  urlActions: { display: 'flex', alignItems: 'center', gap: 10 },
  copyBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6,
    background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569',
    transition: 'all 0.15s',
  },
  previewLink: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 12, color: 'var(--portal-primary)', textDecoration: 'none', fontWeight: 600,
  },
  utmBreakdown: { marginTop: 14 },
  utmTitle: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 },
  utmRow:  { display: 'flex', gap: 8, marginBottom: 5, alignItems: 'center' },
  utmKey:  { fontSize: 11, fontFamily: 'monospace', color: '#64748b', minWidth: 130 },
  utmVal:  { fontSize: 12, fontFamily: 'monospace', color: 'var(--portal-primary)', fontWeight: 600 },
  howToList: { padding: '0 0 0 4px', margin: '0 0 20px', listStyle: 'none' },
  howToItem: { display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: '#475569', alignItems: 'flex-start' },
  howToNum: {
    width: 22, height: 22, borderRadius: 6, background: 'var(--portal-primary-tint)',
    color: 'var(--portal-primary)', fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  tipBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px' },
  tipTitle: { fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 6 },
  tipBody:  { margin: 0, fontSize: 12, color: '#166534', lineHeight: 1.6 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' },
  td: { padding: '9px 10px', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' },
  trEven: { background: '#fafbfd' },
};
