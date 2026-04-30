/**
 * KycDocumentTab — Documents tab shown inside Contact and Organization edit pages.
 *
 * Features
 * ────────
 * • Lists all KYC documents grouped by category
 * • Upload: single or multiple files with a per-file type + label selector
 * • Versioning: shows version history per category/label group
 * • Compression: images auto-compressed; bypass requires super-admin OTP
 * • Delete: soft-delete inline; hard-delete (permanent) requires super-admin OTP
 * • Audit log: expandable per-document activity history
 * • Inline preview for images; PDF opens in new tab
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Eye, Download, History, ChevronDown, ChevronUp, X, Plus, AlertCircle, FileText, Image as ImageIcon } from 'lucide-react';
import {
  getKycDocuments,
  uploadKycDocuments,
  deleteKycDocument,
  updateKycDocument,
  getKycDocumentAudit,
  fetchDocumentBlob,
  requestUncompressedOtp,
  requestDocumentDeleteOtp,
} from '../../services/kycDocumentService';

// ── Constants ─────────────────────────────────────────────────────────────────

const BLOCKED_EXTENSIONS = ['.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz', '.exe', '.bat', '.sh'];

function isFileAllowed(file) {
  const name = file.name.toLowerCase();
  if (BLOCKED_EXTENSIONS.some(ext => name.endsWith(ext))) return false;
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  return allowed.includes(file.type) || name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.gif') || name.endsWith('.webp');
}

function isImage(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OtpModal({ title, maskedEmail, onVerify, onClose, loading }) {
  const [otp, setOtp] = useState('');
  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 13, color: '#334155', marginBottom: 12 }}>
          An OTP has been sent to <strong>{maskedEmail}</strong>. Enter it below to proceed.
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit OTP"
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={{ ...inputStyle, letterSpacing: 6, fontSize: 20, textAlign: 'center', marginBottom: 14 }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={btnSecondary} disabled={loading}>Cancel</button>
          <button onClick={() => onVerify(otp)} style={btnPrimary} disabled={loading || otp.length !== 6}>
            {loading ? 'Verifying…' : 'Verify & Proceed'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditModal({ docId, docName, onClose }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getKycDocumentAudit(docId)
      .then(setLog)
      .catch(() => setLog([]))
      .finally(() => setLoading(false));
  }, [docId]);

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Audit — {docName}</span>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>}
          {!loading && log.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No audit entries.</p>}
          {log.map(entry => (
            <div key={entry.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 0', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, textTransform: 'capitalize', color: actionColor(entry.action) }}>
                  {entry.action.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#94a3b8' }}>{formatDate(entry.created_at)}</span>
              </div>
              <span style={{ color: '#475569' }}>by {entry.actor_name || entry.actor_display || 'System'}</span>
              {entry.notes && <div style={{ color: '#64748b', marginTop: 2 }}>{entry.notes}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function actionColor(action) {
  if (action === 'uploaded' || action === 'new_version_uploaded') return '#16a34a';
  if (action === 'hard_deleted' || action === 'soft_deleted') return '#dc2626';
  if (action === 'downloaded' || action === 'viewed') return '#2563eb';
  return '#334155';
}

// ── File selection and staging ────────────────────────────────────────────────

function FileStager({ categories, onUpload, uploading }) {
  const [stagedFiles, setStagedFiles] = useState([]);
  const [errors, setErrors]           = useState([]);
  const [otpState, setOtpState]       = useState(null); // { maskedEmail, resolve }
  const [otpLoading, setOtpLoading]   = useState(false);
  const [skipComp, setSkipComp]       = useState(false);
  const [otpCode, setOtpCode]         = useState('');
  const [compOtpSent, setCompOtpSent] = useState(false);
  const [compOtpLoading, setCompOtpLoading] = useState(false);
  const dropRef = useRef(null);

  const addFiles = useCallback((rawFiles) => {
    const allowed = [], blocked = [];
    Array.from(rawFiles).forEach(f => {
      if (isFileAllowed(f)) allowed.push(f);
      else blocked.push(f.name);
    });
    if (blocked.length) setErrors(e => [...e, `Blocked (not allowed): ${blocked.join(', ')}`]);
    setStagedFiles(prev => {
      const next = [...prev];
      allowed.forEach(f => {
        if (next.length < 10) {
          const nameWithoutExt = f.name.replace(/\.[^/.]+$/, '');
          next.push({ file: f, category: Object.keys(categories)[0] || '', label: nameWithoutExt });
        }
      });
      return next;
    });
  }, [categories]);

  function handleDrop(e) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  function removeStaged(idx) {
    setStagedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function updateStaged(idx, field, value) {
    setStagedFiles(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleRequestCompOtp() {
    setCompOtpLoading(true);
    try {
      const res = await requestUncompressedOtp();
      setCompOtpSent(true);
      setOtpState({ maskedEmail: res.masked_email });
    } catch (e) {
      setErrors(err => [...err, e.message || 'Failed to send OTP.']);
    } finally {
      setCompOtpLoading(false);
    }
  }

  async function handleUpload() {
    if (stagedFiles.length === 0) return;
    setErrors([]);

    // Group by category + label
    const groups = {};
    for (const { file, category, label } of stagedFiles) {
      if (!category) { setErrors(['Each file needs a document type selected.']); return; }
      const key = `${category}||${label}`;
      if (!groups[key]) groups[key] = { category, label, files: [] };
      groups[key].files.push(file);
    }

    try {
      for (const { category, label, files } of Object.values(groups)) {
        await onUpload({ docCategory: category, docLabel: label, skipCompression: skipComp, otpCode, files });
      }
      setStagedFiles([]);
      setSkipComp(false);
      setOtpCode('');
      setCompOtpSent(false);
    } catch (e) {
      setErrors([e.message || 'Upload failed.']);
    }
  }

  const catOptions = Object.entries(categories);

  return (
    <div>
      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        style={dropZone}
        onClick={() => document.getElementById('kyc-file-input')?.click()}
      >
        <Upload size={22} color="#94a3b8" />
        <span style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>Drop files here or click to browse</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>JPEG, PNG, GIF, WebP, PDF · Max 10 files · No ZIP/TAR</span>
        <input
          id="kyc-file-input"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* Error messages */}
      {errors.map((err, i) => (
        <div key={i} style={errorBanner}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{err}</span>
          <button onClick={() => setErrors(e => e.filter((_, j) => j !== i))} style={iconBtnSm}><X size={12} /></button>
        </div>
      ))}

      {/* Staged file list */}
      {stagedFiles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
            {stagedFiles.length} file(s) selected — assign type for each:
          </div>
          {stagedFiles.map(({ file, category, label }, idx) => (
            <div key={idx} style={stagedRow}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                {isImage(file.type)
                  ? <ImageIcon size={14} color="#2563eb" />
                  : <FileText size={14} color="#dc2626" />}
                <span style={{ fontSize: 12, color: '#334155', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>({formatBytes(file.size)})</span>
                <select
                  value={category}
                  onChange={e => updateStaged(idx, 'category', e.target.value)}
                  style={{ ...selectStyle, fontSize: 12, padding: '4px 8px' }}
                >
                  {catOptions.map(([code, { label: l }]) => (
                    <option key={code} value={code}>{l}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Label (e.g. HDFC Savings)"
                  value={label}
                  onChange={e => updateStaged(idx, 'label', e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: '4px 8px', width: 160 }}
                />
              </div>
              <button onClick={() => removeStaged(idx)} style={iconBtnSm}><X size={14} /></button>
            </div>
          ))}

          {/* Compression toggle */}
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="skip-comp" checked={skipComp} onChange={e => {
                setSkipComp(e.target.checked);
                if (!e.target.checked) { setOtpCode(''); setCompOtpSent(false); }
              }} />
              <label htmlFor="skip-comp" style={{ fontSize: 12, color: '#334155' }}>
                Upload without compression (images stored at original quality)
              </label>
            </div>
            {skipComp && (
              <div style={{ marginTop: 8 }}>
                {!compOtpSent ? (
                  <button onClick={handleRequestCompOtp} style={{ ...btnSecondary, fontSize: 12 }} disabled={compOtpLoading}>
                    {compOtpLoading ? 'Sending OTP…' : 'Request OTP to proceed'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>OTP sent. Enter here:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit OTP"
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      style={{ ...inputStyle, fontSize: 13, width: 120, padding: '4px 8px' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleUpload}
            style={{ ...btnPrimary, marginTop: 12 }}
            disabled={uploading || (skipComp && (!compOtpSent || otpCode.length !== 6))}
          >
            <Upload size={14} style={{ marginRight: 6 }} />
            {uploading ? 'Uploading…' : `Upload ${stagedFiles.length} File(s)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({ doc, categoryLabel, onDeleted, onPreview }) {
  const [showAudit, setShowAudit] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [deleteStep, setDeleteStep] = useState(null); // null | 'confirm' | 'otp-send' | 'otp-enter'
  const [deleteOtp, setDeleteOtp]   = useState('');
  const [deleteOtpSent, setDeleteOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [err, setErr]               = useState('');

  async function handleSoftDelete() {
    setDeleting(true);
    setErr('');
    try {
      await deleteKycDocument(doc.id);
      onDeleted(doc.id);
    } catch (e) {
      setErr(e.message || 'Delete failed.');
    } finally {
      setDeleting(false);
      setDeleteStep(null);
    }
  }

  async function sendDeleteOtp() {
    setOtpSending(true);
    setErr('');
    try {
      await requestDocumentDeleteOtp();
      setDeleteOtpSent(true);
      setDeleteStep('otp-enter');
    } catch (e) {
      setErr(e.message || 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleHardDelete() {
    if (deleteOtp.length !== 6) return;
    setDeleting(true);
    setErr('');
    try {
      await deleteKycDocument(doc.id, deleteOtp);
      onDeleted(doc.id);
    } catch (e) {
      setErr(e.message || 'Delete failed.');
    } finally {
      setDeleting(false);
      setDeleteStep(null);
    }
  }

  return (
    <div style={docRow}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1 }}>
        {isImage(doc.mime_type)
          ? <ImageIcon size={16} color="#2563eb" style={{ marginTop: 2, flexShrink: 0 }} />
          : <FileText size={16} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.original_file_name}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3, fontSize: 11, color: '#64748b' }}>
            {doc.doc_label && <span style={chip}>{doc.doc_label}</span>}
            <span>v{doc.version_number}{doc.is_latest ? ' · Latest' : ''}</span>
            <span>{formatBytes(doc.file_size)}</span>
            {doc.is_compressed && doc.original_size > doc.file_size && (
              <span style={{ color: '#16a34a' }}>
                ↓{Math.round((1 - doc.file_size / doc.original_size) * 100)}% compressed
              </span>
            )}
            <span>by {doc.uploaded_by_name || '—'}</span>
            <span>{formatDate(doc.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        <button title="Preview / View" style={iconBtn} onClick={() => onPreview(doc)}>
          <Eye size={14} />
        </button>
        <button title="Download" style={iconBtn} onClick={async () => {
          try {
            const url = await fetchDocumentBlob(doc.id, true);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = doc.original_file_name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          } catch {}
        }}>
          <Download size={14} />
        </button>
        <button title="Activity log" style={iconBtn} onClick={() => setShowAudit(true)}>
          <History size={14} />
        </button>
        <button title="Delete" style={{ ...iconBtn, color: '#dc2626' }} onClick={() => setDeleteStep('confirm')}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Delete flow */}
      {deleteStep === 'confirm' && (
        <div style={inlineConfirm}>
          <span style={{ fontSize: 12, color: '#334155' }}>Delete this document?</span>
          {err && <span style={{ color: '#dc2626', fontSize: 11 }}>{err}</span>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setDeleteStep(null)} style={{ ...btnSecondary, fontSize: 11, padding: '3px 10px' }}>Cancel</button>
            <button onClick={handleSoftDelete} style={{ ...btnDanger, fontSize: 11, padding: '3px 10px' }} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Soft Delete'}
            </button>
            <button onClick={() => setDeleteStep('otp-send')} style={{ ...btnDanger, fontSize: 11, padding: '3px 10px', background: '#7f1d1d' }}>
              Permanent Delete (OTP)
            </button>
          </div>
        </div>
      )}
      {deleteStep === 'otp-send' && (
        <div style={inlineConfirm}>
          <button onClick={sendDeleteOtp} style={{ ...btnDanger, fontSize: 11 }} disabled={otpSending}>
            {otpSending ? 'Sending…' : 'Send OTP to Super-Admin'}
          </button>
          {err && <span style={{ color: '#dc2626', fontSize: 11 }}>{err}</span>}
        </div>
      )}
      {deleteStep === 'otp-enter' && (
        <div style={inlineConfirm}>
          <span style={{ fontSize: 12 }}>Enter OTP:</span>
          <input
            type="text" inputMode="numeric" maxLength={6}
            value={deleteOtp} onChange={e => setDeleteOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ ...inputStyle, width: 100, fontSize: 13, padding: '4px 8px' }}
          />
          <button onClick={handleHardDelete} style={{ ...btnDanger, fontSize: 11 }} disabled={deleting || deleteOtp.length !== 6}>
            {deleting ? 'Deleting…' : 'Confirm Delete'}
          </button>
          {err && <span style={{ color: '#dc2626', fontSize: 11 }}>{err}</span>}
        </div>
      )}

      {showAudit && <AuditModal docId={doc.id} docName={doc.original_file_name} onClose={() => setShowAudit(false)} />}
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({ code, catDef, docs, onDeleted, onPreview, onAddVersion }) {
  const [expanded, setExpanded] = useState(true);
  const latestDocs   = docs.filter(d => d.is_latest);
  const olderCount   = docs.length - latestDocs.length;
  const [showAll, setShowAll] = useState(false);

  const visibleDocs = showAll ? docs : latestDocs;

  return (
    <div style={catSection}>
      <button style={catHeader} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{catDef.label}</span>
          {docs.length > 0 && (
            <span style={countBadge}>{docs.length}</span>
          )}
          {docs.length === 0 && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>No documents</span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 0 8px 0' }}>
          {visibleDocs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              categoryLabel={catDef.label}
              onDeleted={onDeleted}
              onPreview={onPreview}
            />
          ))}
          {olderCount > 0 && (
            <button style={showHistoryBtn} onClick={() => setShowAll(s => !s)}>
              {showAll ? 'Hide older versions' : `Show ${olderCount} older version(s)`}
            </button>
          )}
          {docs.length === 0 && (
            <div style={{ padding: '8px 0', fontSize: 12, color: '#94a3b8' }}>No documents in this category yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }) {
  const [blobUrl, setBlobUrl]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');

  useEffect(() => {
    if (!doc) return;
    setLoading(true);
    fetchDocumentBlob(doc.id, false)
      .then(url => { setBlobUrl(url); setLoading(false); })
      .catch(e  => { setErr(e.message); setLoading(false); });
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [doc?.id]);

  if (!doc) return null;

  return (
    <div style={{ ...overlay, zIndex: 9999 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '90vw', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{doc.original_file_name}</span>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#f8fafc' }}>
          {loading && <span style={{ color: '#64748b', fontSize: 13 }}>Loading…</span>}
          {err && <span style={{ color: '#dc2626', fontSize: 13 }}>{err}</span>}
          {!loading && !err && blobUrl && isImage(doc.mime_type) && (
            <img src={blobUrl} alt={doc.original_file_name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 6 }} />
          )}
          {!loading && !err && blobUrl && doc.mime_type === 'application/pdf' && (
            <iframe src={blobUrl} title={doc.original_file_name} style={{ width: '100%', height: '70vh', border: 'none' }} />
          )}
        </div>
        <div style={{ padding: '10px 18px', display: 'flex', gap: 10, borderTop: '1px solid #f1f5f9' }}>
          <button onClick={async () => {
            const url = await fetchDocumentBlob(doc.id, true);
            const a   = document.createElement('a');
            a.href = url; a.download = doc.original_file_name; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }} style={{ ...btnPrimary, fontSize: 12 }}>
            <Download size={13} style={{ marginRight: 5 }} /> Download
          </button>
          <button onClick={onClose} style={{ ...btnSecondary, fontSize: 12 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {{ entityType: 'contact'|'organization', entityId: number }} props
 */
export default function KycDocumentTab({ entityType, entityId }) {
  const [documents,   setDocuments]   = useState([]);
  const [categories,  setCategories]  = useState({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [uploadErr,   setUploadErr]   = useState('');
  const [uploadOk,    setUploadOk]    = useState('');
  const [preview,     setPreview]     = useState(null);

  const load = useCallback(() => {
    if (!entityId) return;
    setLoading(true);
    getKycDocuments(entityType, entityId)
      .then(({ documents: docs, categories: cats }) => {
        setDocuments(docs || []);
        setCategories(cats || {});
        setError('');
      })
      .catch(e => setError(e.message || 'Failed to load documents.'))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload({ docCategory, docLabel, skipCompression, otpCode, files }) {
    setUploading(true);
    setUploadErr('');
    setUploadOk('');
    try {
      await uploadKycDocuments({ entityType, entityId, docCategory, docLabel, skipCompression, otpCode, files });
      setUploadOk(`${files.length} file(s) uploaded successfully.`);
      load();
    } catch (e) {
      setUploadErr(e.message || 'Upload failed.');
      throw e;
    } finally {
      setUploading(false);
    }
  }

  function handleDeleted(docId) {
    setDocuments(prev => prev.filter(d => d.id !== docId));
  }

  // Group documents by category
  const byCategory = {};
  for (const doc of documents) {
    if (!byCategory[doc.doc_category]) byCategory[doc.doc_category] = [];
    byCategory[doc.doc_category].push(doc);
  }

  return (
    <div>
      {/* Upload panel */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>Upload KYC Documents</h3>
        {uploadOk && (
          <div style={{ ...successBanner, marginBottom: 12 }}>
            {uploadOk}
            <button onClick={() => setUploadOk('')} style={iconBtnSm}><X size={12} /></button>
          </div>
        )}
        {uploadErr && (
          <div style={{ ...errorBanner, marginBottom: 12 }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            <span>{uploadErr}</span>
            <button onClick={() => setUploadErr('')} style={iconBtnSm}><X size={12} /></button>
          </div>
        )}
        <FileStager categories={categories} onUpload={handleUpload} uploading={uploading} />
      </div>

      {/* Document listing */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>
          KYC Documents
          {!loading && <span style={{ fontWeight: 400, fontSize: 12, color: '#64748b', marginLeft: 8 }}>({documents.length} total)</span>}
        </h3>

        {loading && <p style={{ fontSize: 13, color: '#64748b' }}>Loading…</p>}
        {error && <div style={errorBanner}><AlertCircle size={13} /><span>{error}</span></div>}

        {!loading && !error && Object.entries(categories).map(([code, catDef]) => (
          <CategorySection
            key={code}
            code={code}
            catDef={catDef}
            docs={byCategory[code] || []}
            onDeleted={handleDeleted}
            onPreview={setPreview}
            onAddVersion={() => {}}
          />
        ))}
      </div>

      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};
const modal = {
  background: '#fff', borderRadius: 12,
  padding: 24, width: '90vw', maxWidth: 440,
  boxSizing: 'border-box',
};
const dropZone = {
  border: '2px dashed #cbd5e1', borderRadius: 10,
  padding: '28px 20px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 4, cursor: 'pointer', background: '#f8fafc',
  transition: 'border-color .2s',
};
const stagedRow = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 10px', borderBottom: '1px solid #f1f5f9',
  background: '#fafbfd',
};
const docRow = {
  display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start',
  padding: '10px 0', borderBottom: '1px solid #f8fafc',
};
const catSection = {
  marginBottom: 4, borderRadius: 8, overflow: 'hidden',
  border: '1px solid #f1f5f9', marginTop: 8,
};
const catHeader = {
  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '10px 14px', background: '#f8fafc',
  border: 'none', cursor: 'pointer', textAlign: 'left',
};
const countBadge = {
  background: '#e0f2fe', color: '#0369a1',
  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
};
const chip = {
  background: '#ede9fe', color: '#5b21b6',
  borderRadius: 10, padding: '1px 7px', fontSize: 11,
};
const showHistoryBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 11, color: '#2563eb', padding: '4px 0', display: 'block',
};
const inlineConfirm = {
  width: '100%', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
  padding: '8px 12px', background: '#fff7ed', borderRadius: 6, marginTop: 4,
};
const errorBanner = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: '#fef2f2', color: '#dc2626', borderRadius: 6,
  padding: '7px 10px', fontSize: 12,
};
const successBanner = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: '#f0fdf4', color: '#16a34a', borderRadius: 6,
  padding: '7px 10px', fontSize: 12,
};
const inputStyle = {
  padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
  fontSize: 13, outline: 'none', background: '#fff', color: '#334155',
  boxSizing: 'border-box',
};
const selectStyle = {
  padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7,
  fontSize: 13, background: '#fff', color: '#334155',
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center',
  padding: '8px 16px', background: '#2563eb', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const btnSecondary = {
  padding: '8px 14px', background: '#f1f5f9', color: '#334155',
  border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13,
};
const btnDanger = {
  padding: '8px 14px', background: '#dc2626', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
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
