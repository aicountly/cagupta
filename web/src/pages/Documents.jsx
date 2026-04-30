/**
 * Documents — Global KYC Document Management Page (/documents)
 *
 * Browse all uploaded KYC documents across contacts and organisations.
 * Filter by entity type, document category, and free-text search.
 * Supports inline preview (image) and download.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Image as ImageIcon, Eye, Download, History, X, ChevronLeft, ChevronRight as ChevronRightIcon, Trash2 } from 'lucide-react';
import { listAllKycDocuments, fetchDocumentBlob, getKycDocumentAudit, deleteKycDocumentAudit } from '../services/kycDocumentService';
import { useAuth } from '../auth/AuthContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: '',             label: 'All Entities' },
  { value: 'contact',      label: 'Contacts' },
  { value: 'organization', label: 'Organizations' },
];

const CONTACT_CATEGORIES = {
  pan: 'PAN Card', aadhaar: 'Aadhaar Card', din: 'DIN',
  driving_license: 'Driving License', voter_id: 'Voter ID',
  passport: 'Passport', bank_proof: 'Bank Proof',
  utility_telephone: 'Utility Bill - Telephone',
  utility_water: 'Utility Bill - Water & Sewage',
  utility_electricity: 'Utility Bill - Electricity',
  signature: 'Signature', photograph: 'Photograph', other: 'Other',
};

const ORG_CATEGORIES = {
  coi: 'COI', aoa: 'AOA', moa: 'MOA', iec: 'IEC',
  pan: 'PAN Card', tan: 'TAN', gst_certificate: 'GST Certificate',
  bank_proof: 'Bank Proof',
  utility_telephone: 'Utility Bill - Telephone',
  utility_water: 'Utility Bill - Water & Sewage',
  utility_electricity: 'Utility Bill - Electricity',
  rcmc: 'RCMC Certificate', other_registration: 'Other Registration', other: 'Other',
};

const ALL_CATEGORIES = { ...CONTACT_CATEGORIES, ...ORG_CATEGORIES };

const PER_PAGE = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isImage(mime) { return mime && mime.startsWith('image/'); }

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function categoryLabel(code) {
  return ALL_CATEGORIES[code] || code;
}

function entityKey(type, id) {
  const prefix = type === 'organization' ? 'ORG' : 'CLT';
  return `${prefix}-${String(id).padStart(3, '0')}`;
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  useEffect(() => {
    if (!doc) return;
    let url = null;
    setLoading(true); setErr('');
    fetchDocumentBlob(doc.id, false)
      .then(u => { url = u; setBlobUrl(u); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc?.id]);

  if (!doc) return null;

  return (
    <div style={overlay}>
      <div style={previewBox}>
        <div style={previewHeader}>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
            {doc.original_file_name}
          </span>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={previewBody}>
          {loading && <span style={{ color: '#64748b', fontSize: 13 }}>Loading…</span>}
          {err     && <span style={{ color: '#dc2626', fontSize: 13 }}>{err}</span>}
          {!loading && !err && blobUrl && isImage(doc.mime_type) && (
            <img src={blobUrl} alt={doc.original_file_name} style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 6 }} />
          )}
          {!loading && !err && blobUrl && doc.mime_type === 'application/pdf' && (
            <iframe src={blobUrl} title={doc.original_file_name} style={{ width: '100%', height: '65vh', border: 'none' }} />
          )}
        </div>
        <div style={{ padding: '10px 18px', display: 'flex', gap: 10, borderTop: '1px solid #f1f5f9' }}>
          <button onClick={async () => {
            const url = await fetchDocumentBlob(doc.id, true);
            const a = document.createElement('a');
            a.href = url; a.download = doc.original_file_name; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }} style={btnPrimary}>
            <Download size={13} style={{ marginRight: 5 }} /> Download
          </button>
          <button onClick={onClose} style={btnSecondary}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Audit modal ───────────────────────────────────────────────────────────────

function actionColor(action) {
  if (action === 'uploaded' || action === 'new_version_uploaded') return '#16a34a';
  if (action === 'hard_deleted' || action === 'soft_deleted')     return '#dc2626';
  if (action === 'downloaded'   || action === 'viewed')           return '#2563eb';
  return '#334155';
}

function AuditModal({ doc, onClose, isSuperAdmin }) {
  const [log,      setLog]      = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [deleting, setDeleting] = useState(false);
  const [delErr,   setDelErr]   = useState('');

  const loadLog = useCallback(() => {
    if (!doc) return;
    setLoading(true); setErr('');
    getKycDocumentAudit(doc.id)
      .then(setLog)
      .catch(e => { setErr(e.message || 'Failed to load audit log.'); setLog([]); })
      .finally(() => setLoading(false));
  }, [doc?.id]);

  useEffect(() => { loadLog(); }, [loadLog]);

  async function handleDeleteAuditLog() {
    if (!window.confirm(
      `Delete the entire audit log for "${doc.original_file_name}"?\n\nThis action cannot be undone.`
    )) return;

    setDeleting(true); setDelErr('');
    try {
      await deleteKycDocumentAudit(doc.id);
      setLog([]);
    } catch (e) {
      setDelErr(e.message || 'Failed to delete audit log.');
    } finally {
      setDeleting(false);
    }
  }

  if (!doc) return null;

  return (
    <div style={overlay}>
      <div style={{ ...auditBox }}>
        <div style={previewHeader}>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
            Audit — {doc.original_file_name}
          </span>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 18px' }}>
          {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>}
          {err     && <p style={{ color: '#dc2626', fontSize: 13 }}>{err}</p>}
          {!loading && !err && log.length === 0 && (
            <p style={{ color: '#64748b', fontSize: 13 }}>No audit entries found.</p>
          )}
          {log.map(entry => (
            <div key={entry.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 0', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, textTransform: 'capitalize', color: actionColor(entry.action) }}>
                  {entry.action.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {entry.created_at
                    ? new Date(entry.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </span>
              </div>
              <span style={{ color: '#475569' }}>
                by {entry.actor_name || entry.actor_display || 'System'}
              </span>
              {entry.notes && (
                <div style={{ color: '#64748b', marginTop: 2 }}>{entry.notes}</div>
              )}
            </div>
          ))}
        </div>

        {isSuperAdmin && (
          <div style={{ padding: '10px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleDeleteAuditLog}
              disabled={deleting || loading}
              style={btnDanger}
            >
              <Trash2 size={13} style={{ marginRight: 5 }} />
              {deleting ? 'Clearing…' : 'Clear Audit Log'}
            </button>
            {delErr && <span style={{ fontSize: 12, color: '#dc2626' }}>{delErr}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Documents() {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [docs,        setDocs]        = useState([]);
  const [pagination,  setPagination]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [preview,     setPreview]     = useState(null);
  const [auditDoc,    setAuditDoc]    = useState(null);

  // Filters
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [entityType,   setEntityType]   = useState('');
  const [category,     setCategory]     = useState('');
  const [page,         setPage]         = useState(1);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    listAllKycDocuments({ page, perPage: PER_PAGE, search, entityType, category })
      .then(({ docs: d, pagination: p }) => {
        setDocs(d || []);
        setPagination(p);
        setError('');
      })
      .catch(e => setError(e.message || 'Failed to load documents.'))
      .finally(() => setLoading(false));
  }, [page, search, entityType, category]);

  useEffect(() => { load(); }, [load]);

  function handleFilterChange(field, value) {
    if (field === 'entityType') setEntityType(value);
    if (field === 'category')   setCategory(value);
    setPage(1);
  }

  const totalPages = pagination ? pagination.last_page : 1;
  const totalDocs  = pagination ? pagination.total : 0;

  // Build category options based on entity type filter
  const catOptions = entityType === 'contact'
    ? CONTACT_CATEGORIES
    : entityType === 'organization'
    ? ORG_CATEGORIES
    : ALL_CATEGORIES;

  return (
    <div style={{ padding: 24, background: '#F6F7FB', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0B1F3B' }}>Document Management</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
          Browse all KYC documents across contacts and organisations.
          To upload documents, open the contact or organisation and use the <strong>KYC Documents</strong> tab.
        </p>
      </div>

      {/* Filter bar */}
      <div style={filterBar}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Search by name, label, entity…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32, width: '100%' }}
          />
        </div>
        <select value={entityType} onChange={e => handleFilterChange('entityType', e.target.value)} style={selectStyle}>
          {ENTITY_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
        </select>
        <select value={category} onChange={e => handleFilterChange('category', e.target.value)} style={selectStyle}>
          <option value="">All Categories</option>
          {Object.entries(catOptions).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        {(search || entityType || category) && (
          <button onClick={() => { setSearchInput(''); setEntityType(''); setCategory(''); setPage(1); }} style={btnClear}>
            <X size={13} style={{ marginRight: 4 }} /> Clear
          </button>
        )}
      </div>

      {/* Stats row */}
      {!loading && !error && (
        <div style={statsRow}>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {totalDocs} document{totalDocs !== 1 ? 's' : ''} found
            {search && ` for "${search}"`}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={errorBanner}>{error}</div>
      )}

      {/* Table */}
      <div style={card}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {['', 'File', 'Entity', 'Category', 'Label', 'Version', 'Size', 'Uploaded By', 'Date', 'Actions'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>Loading…</td></tr>
            )}
            {!loading && docs.length === 0 && (
              <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                No documents found.{(search || entityType || category) && ' Try adjusting your filters.'}
              </td></tr>
            )}
            {docs.map(doc => (
              <tr key={doc.id} style={trHover}>
                <td style={{ ...tdStyle, width: 28, paddingRight: 0 }}>
                  {isImage(doc.mime_type)
                    ? <ImageIcon size={15} color="#2563eb" />
                    : <FileText  size={15} color="#dc2626" />}
                </td>
                <td style={{ ...tdStyle, maxWidth: 220 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.original_file_name}
                  </div>
                  {doc.is_latest === false && (
                    <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>older version</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => navigate(doc.entity_type === 'contact'
                      ? `/clients/contacts/${doc.entity_id}/edit`
                      : `/clients/organizations/${doc.entity_id}/edit`)}
                    style={entityLink}
                  >
                    <span style={entityBadge(doc.entity_type)}>{doc.entity_type === 'contact' ? 'C' : 'O'}</span>
                    <span style={{ marginLeft: 5 }}>
                      {doc.entity_display_name
                        ? doc.entity_display_name.trim() || entityKey(doc.entity_type, doc.entity_id)
                        : entityKey(doc.entity_type, doc.entity_id)}
                    </span>
                  </button>
                </td>
                <td style={tdStyle}>
                  <span style={catBadge}>{categoryLabel(doc.doc_category)}</span>
                </td>
                <td style={{ ...tdStyle, color: '#475569', fontSize: 12 }}>
                  {doc.doc_label || <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                  v{doc.version_number}
                </td>
                <td style={{ ...tdStyle, color: '#64748b', fontSize: 12 }}>
                  {formatBytes(doc.file_size)}
                  {doc.is_compressed && doc.original_size > doc.file_size && (
                    <span style={{ color: '#16a34a', fontSize: 10, display: 'block' }}>
                      ↓{Math.round((1 - doc.file_size / doc.original_size) * 100)}%
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, color: '#64748b', fontSize: 12 }}>
                  {doc.uploaded_by_name || '—'}
                </td>
                <td style={{ ...tdStyle, color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {formatDate(doc.created_at)}
                </td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <button title="Preview" style={iconBtn} onClick={() => setPreview(doc)}>
                    <Eye size={14} />
                  </button>
                  <button title="Download" style={iconBtn} onClick={async () => {
                    try {
                      const url = await fetchDocumentBlob(doc.id, true);
                      const a = document.createElement('a');
                      a.href = url; a.download = doc.original_file_name; a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 5000);
                    } catch {}
                  }}>
                    <Download size={14} />
                  </button>
                  <button title="Activity / Audit Log" style={{ ...iconBtn, color: '#7c3aed' }} onClick={() => setAuditDoc(doc)}>
                    <History size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={paginationRow}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Page {page} of {totalPages} · {totalDocs} total
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={pgBtn}>
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1
                  : page <= 4 ? i + 1
                  : page >= totalPages - 3 ? totalPages - 6 + i
                  : page - 3 + i;
                return (
                  <button key={p} onClick={() => setPage(p)} style={p === page ? pgBtnActive : pgBtn}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pgBtn}>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {preview   && <PreviewModal doc={preview}   onClose={() => setPreview(null)} />}
      {auditDoc  && <AuditModal   doc={auditDoc}  onClose={() => setAuditDoc(null)} isSuperAdmin={isSuperAdmin} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const filterBar = {
  display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14,
};
const statsRow = {
  marginBottom: 10,
};
const card = {
  background: '#fff', borderRadius: 12,
  border: '1px solid #e2e8f0', overflow: 'auto',
};
const tableStyle = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
};
const thStyle = {
  textAlign: 'left', padding: '10px 12px',
  color: '#64748b', fontWeight: 600, fontSize: 11,
  borderBottom: '2px solid #f1f5f9', background: '#f8fafc',
  whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '10px 12px', color: '#334155', verticalAlign: 'middle',
};
const trHover = {
  borderBottom: '1px solid #f8fafc',
};
const inputStyle = {
  padding: '8px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, outline: 'none',
  background: '#fff', color: '#334155', boxSizing: 'border-box',
};
const selectStyle = {
  padding: '8px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, background: '#fff',
  color: '#334155', cursor: 'pointer',
};
const btnClear = {
  display: 'inline-flex', alignItems: 'center',
  padding: '7px 12px', background: '#f1f5f9',
  color: '#475569', border: '1px solid #e2e8f0',
  borderRadius: 8, cursor: 'pointer', fontSize: 12,
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center',
  padding: '8px 14px', background: '#2563eb', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
};
const btnSecondary = {
  padding: '8px 14px', background: '#f1f5f9', color: '#334155',
  border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 12,
};
const btnDanger = {
  display: 'inline-flex', alignItems: 'center',
  padding: '7px 13px', background: '#fef2f2', color: '#dc2626',
  border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer',
  fontSize: 12, fontWeight: 600,
};
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px 5px', borderRadius: 5, color: '#475569',
  display: 'inline-flex', alignItems: 'center',
};
const iconBtnSm = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '2px 4px', color: '#64748b',
  display: 'inline-flex', alignItems: 'center',
};
const catBadge = {
  display: 'inline-block',
  background: '#ede9fe', color: '#5b21b6',
  borderRadius: 10, padding: '2px 8px',
  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
};
const entityLink = {
  background: 'none', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  fontSize: 13, color: '#1e293b', padding: 0,
  textDecoration: 'none',
};
function entityBadge(type) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700,
    background: type === 'organization' ? '#dbeafe' : '#dcfce7',
    color: type === 'organization' ? '#1d4ed8' : '#15803d',
    flexShrink: 0,
  };
}
const errorBanner = {
  background: '#fef2f2', color: '#dc2626',
  borderRadius: 8, padding: '10px 14px',
  fontSize: 13, marginBottom: 12,
};
const paginationRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 16px', borderTop: '1px solid #f1f5f9',
};
const pgBtn = {
  padding: '4px 9px', border: '1px solid #e2e8f0',
  borderRadius: 6, background: '#fff', cursor: 'pointer',
  fontSize: 12, color: '#334155', display: 'inline-flex', alignItems: 'center',
};
const pgBtnActive = {
  ...pgBtn, background: '#2563eb', color: '#fff', borderColor: '#2563eb', fontWeight: 700,
};
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const previewBox = {
  background: '#fff', borderRadius: 12,
  width: '90vw', maxWidth: 900, maxHeight: '90vh',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const previewHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
};
const previewBody = {
  flex: 1, overflow: 'auto', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  padding: 16, background: '#f8fafc',
};
const auditBox = {
  background: '#fff', borderRadius: 12,
  width: '90vw', maxWidth: 600, maxHeight: '80vh',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
