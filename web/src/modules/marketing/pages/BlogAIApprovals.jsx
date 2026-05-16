import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, CheckCircle2, XCircle, Pencil, Loader2,
  AlertCircle, RefreshCw, Upload, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  fetchDrafts, updateDraft, approveDraft, rejectDraft, uploadBlogImage,
} from '../services/blog.service';

const CATEGORIES = [
  { value: 'laws',       label: 'New Laws & Provisions',       color: '#2563eb', bg: '#eff6ff' },
  { value: 'tax_saving', label: 'Tax Saving & Tax Planning',   color: '#d97706', bg: '#fef3c7' },
];

function catConfig(value) {
  return CATEGORIES.find(c => c.value === value) ?? { label: value, color: '#64748b', bg: '#f1f5f9' };
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function BlogAIApprovals() {
  const [drafts, setDrafts]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [filterCat, setFilterCat]   = useState('');
  const [filterSt, setFilterSt]     = useState('pending');
  const [editingId, setEditingId]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [saving, setSaving]         = useState(false);
  const [actionId, setActionId]     = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [coverPreviews, setCoverPreviews] = useState({});
  const [uploading, setUploading]   = useState(null);
  const fileRefs = useRef({});

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchDrafts({ status: filterSt, category: filterCat });
      setDrafts(res.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterSt, filterCat]);

  const startEdit = (draft) => {
    setEditingId(draft.id);
    setEditForm({ title: draft.title, excerpt: draft.excerpt ?? '', content: draft.content, cover_image_path: draft.cover_image_path ?? '' });
    setCoverPreviews(p => ({ ...p, [draft.id]: draft.cover_image_url ?? '' }));
    setExpandedId(draft.id);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    try {
      await updateDraft(id, editForm);
      setEditingId(null);
      load();
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (draft) => {
    if (!window.confirm(`Approve and publish "${draft.title}"?\n\nThis will create a published blog post and email all active clients.`)) return;
    setActionId(draft.id);
    try {
      await approveDraft(draft.id);
      load();
    } catch (e) {
      alert('Approval failed: ' + e.message);
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (draft) => {
    if (!window.confirm(`Reject and discard draft "${draft.title}"?`)) return;
    setActionId(draft.id);
    try {
      await rejectDraft(draft.id);
      load();
    } catch (e) {
      alert('Reject failed: ' + e.message);
    } finally {
      setActionId(null);
    }
  };

  const handleImageUpload = async (e, draftId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(draftId);
    try {
      const res = await uploadBlogImage(file);
      setEditForm(f => ({ ...f, cover_image_path: res.data.path }));
      setCoverPreviews(p => ({ ...p, [draftId]: res.data.url }));
    } catch (e) {
      alert('Image upload failed: ' + e.message);
    } finally {
      setUploading(null);
    }
  };

  const pendingCount = drafts.filter(d => d.status === 'pending').length;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>AI Draft Approvals</h1>
            {pendingCount > 0 && (
              <span style={{ background: '#F37920', color: '#fff', borderRadius: 99, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                {pendingCount} pending
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Review, edit and approve AI-generated blog drafts before they go live
          </p>
        </div>
        <button onClick={load} style={btn.secondary} title="Refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value)} style={sel}>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All Statuses</option>
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={sel}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...alertBox, background: '#fef2f2', color: '#dc2626', marginBottom: 16 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {/* Empty */}
      {!loading && drafts.length === 0 && (
        <div style={{ textAlign: 'center', padding: 70, color: '#94a3b8' }}>
          <Sparkles size={36} style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>No drafts found</p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>AI-generated drafts will appear here once the daily cron runs.</p>
        </div>
      )}

      {/* Draft cards grouped by category */}
      {!loading && drafts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {drafts.map(draft => {
            const cat     = catConfig(draft.category);
            const isEditing = editingId === draft.id;
            const isExpanded = expandedId === draft.id;
            const isActing  = actionId === draft.id;

            return (
              <div key={draft.id} style={{
                background: '#fff', border: '1px solid #e2e8f0',
                borderRadius: 12, overflow: 'hidden',
                boxShadow: isEditing ? '0 0 0 2px #F37920' : 'none',
              }}>
                {/* Card header */}
                <div style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* Cover thumbnail */}
                  <div style={{ width: 80, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#f1f5f9' }}>
                    {(coverPreviews[draft.id] || draft.cover_image_url) ? (
                      <img src={coverPreviews[draft.id] || draft.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={20} style={{ color: '#cbd5e1' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ background: cat.bg, color: cat.color, borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                        {cat.label}
                      </span>
                      <span style={{ background: STATUS_BG[draft.status], color: STATUS_COLOR[draft.status], borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                        {draft.status}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>Option {draft.option_index}</span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {draft.title}
                    </h3>
                    {draft.excerpt && (
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                        {draft.excerpt}
                      </p>
                    )}
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      Generated {formatDate(draft.created_at)} · Topic: {draft.topic}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                      style={btn.icon}
                      title={isExpanded ? 'Collapse' : 'Expand content'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {draft.status === 'pending' && !isEditing && (
                      <button onClick={() => startEdit(draft)} style={btn.icon} title="Edit">
                        <Pencil size={15} />
                      </button>
                    )}
                    {draft.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(draft)}
                          disabled={isActing}
                          style={{ ...btn.approve }}
                          title="Approve & Publish"
                        >
                          {isActing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={13} />}
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(draft)}
                          disabled={isActing}
                          style={{ ...btn.reject }}
                          title="Reject"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded content / editor */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '20px', background: '#fafafa' }}>
                    {isEditing ? (
                      <>
                        <label style={lbl}>Title</label>
                        <input style={inp} value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />

                        <label style={{ ...lbl, marginTop: 12 }}>Excerpt</label>
                        <textarea style={{ ...inp, height: 64, resize: 'vertical' }} value={editForm.excerpt} onChange={e => setEditForm(f => ({ ...f, excerpt: e.target.value }))} />

                        <label style={{ ...lbl, marginTop: 12 }}>Cover Image</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <button type="button" onClick={() => fileRefs.current[draft.id]?.click()} style={btn.secondary} disabled={uploading === draft.id}>
                            {uploading === draft.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                            {uploading === draft.id ? 'Uploading…' : 'Replace Cover'}
                          </button>
                          <input
                            ref={el => fileRefs.current[draft.id] = el}
                            type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => handleImageUpload(e, draft.id)}
                          />
                        </div>
                        {coverPreviews[draft.id] && (
                          <img src={coverPreviews[draft.id]} alt="cover" style={{ width: 200, height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }} />
                        )}

                        <label style={{ ...lbl, marginTop: 4 }}>Content</label>
                        <textarea
                          style={{ ...inp, height: 380, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                          value={editForm.content}
                          onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                        />

                        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                          <button onClick={() => handleSaveEdit(draft.id)} style={btn.primary} disabled={saving}>
                            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                            {saving ? 'Saving…' : 'Save Changes'}
                          </button>
                          <button onClick={cancelEdit} style={btn.secondary}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#334155', lineHeight: 1.7, maxHeight: 420, overflowY: 'auto' }}>
                        {draft.content}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const STATUS_BG    = { pending: '#fef9c3', approved: '#f0fdf4', rejected: '#fef2f2' };
const STATUS_COLOR = { pending: '#ca8a04', approved: '#16a34a', rejected: '#dc2626' };

const btn = {
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#F37920', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 16px', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
  secondary: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '6px 13px', fontSize: 13,
    fontWeight: 500, cursor: 'pointer',
  },
  icon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#64748b', padding: '5px 7px', borderRadius: 6,
  },
  approve: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
    borderRadius: 8, padding: '6px 13px', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
  reject: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
    borderRadius: 8, padding: '6px 13px', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
};

const sel = { padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#334155', background: '#fff', cursor: 'pointer' };
const alertBox = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, fontSize: 13 };
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 };
const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
