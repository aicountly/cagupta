import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, CheckCircle2, XCircle, Pencil, Loader2,
  AlertCircle, RefreshCw, Upload, X, ChevronDown, ChevronUp, Mail, Globe, Radio,
} from 'lucide-react';
import {
  fetchDrafts, updateDraft, approveDraft, rejectDraft, uploadBlogImage,
  generateAiDraftsStream,
} from '../services/blog.service';
import { RichTextEditor } from '../components/RichTextEditor';
import AiDraftPlannerModal from '../components/AiDraftPlannerModal';
import { isHtml, markdownToHtml } from '../../../utils/blogContent';
import { API_BASE_URL } from '../../../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const CATEGORIES = [
  { value: 'laws',                  label: 'New Laws & Provisions',      color: '#2563eb', bg: '#eff6ff' },
  { value: 'tax_saving',            label: 'Tax Saving & Tax Planning',  color: '#d97706', bg: '#fef3c7' },
  { value: 'ai_promotions',         label: 'AI Promotions',              color: '#7c3aed', bg: '#f3e8ff' },
  { value: 'subsidies_promotions',  label: 'Subsidies Promotions',       color: '#059669', bg: '#ecfdf5' },
  { value: 'funding_promotions',    label: 'Funding Promotions',         color: '#c2410c', bg: '#fff7ed' },
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
  const [generating, setGenerating] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerLines, setPlannerLines] = useState([]);
  const [plannerModelReasoning, setPlannerModelReasoning] = useState('');
  const [plannerModelAssistant, setPlannerModelAssistant] = useState('');
  const [plannerSummary, setPlannerSummary] = useState(null);
  const [plannerErr, setPlannerErr] = useState('');
  const [approveModal, setApproveModal] = useState(null);
  const [approving, setApproving]   = useState(false);
  const [approveError, setApproveError] = useState('');
  const [emailResult, setEmailResult] = useState(null);
  const [waChannels, setWaChannels] = useState([]);
  const [selectedWaChannel, setSelectedWaChannel] = useState('');
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
    const raw = (draft.content || '').replace(/\\n/g, '\n');
    const content = raw
      ? (isHtml(raw) ? raw : markdownToHtml(raw))
      : '';
    setEditForm({ title: draft.title, excerpt: draft.excerpt ?? '', content, cover_image_path: draft.cover_image_path ?? '' });
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

  const fetchWaChannels = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/marketing/wa/channels`, { headers: authHeaders() });
      if (res.ok) {
        const json = await res.json();
        setWaChannels(json.data || []);
      }
    } catch {
      // WA bridge may not be running — silently ignore
    }
  };

  const handleApprove = (draft) => {
    setApproveError('');
    setSelectedWaChannel('');
    setApproveModal(draft);
    fetchWaChannels();
  };

  const doApprove = async (sendEmail, sendWa = false) => {
    if (!approveModal) return;
    setApproving(true);
    setApproveError('');
    setActionId(approveModal.id);
    try {
      const waJid = (sendWa && selectedWaChannel) ? selectedWaChannel : null;
      const res = await approveDraft(approveModal.id, sendEmail, waJid);
      setApproveModal(null);
      if (sendEmail && res?.data?.email) {
        setEmailResult({ postTitle: approveModal.title, ...res.data.email });
      }
      load();
    } catch (e) {
      setApproveError(e.message);
    } finally {
      setApproving(false);
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
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB. The server will auto-compress it to ≤1 MB for optimal social sharing.');
      return;
    }
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

  const handleGenerateNow = async () => {
    if (!window.confirm(
      'Run the AI blog generator now?\n\n'
      + 'This uses the same process as the daily 6 AM cron job: new topics and drafts '
      + 'from OpenAI, plus cover images when enabled. It can take several minutes.',
    )) return;

    setPlannerOpen(true);
    setPlannerLines([]);
    setPlannerModelReasoning('');
    setPlannerModelAssistant('');
    setPlannerSummary(null);
    setPlannerErr('');
    setGenerating(true);
    setError('');
    try {
      const done = await generateAiDraftsStream({}, {
        onLogLine: (line) => { setPlannerLines(prev => [...prev, line]); },
        onModelChunk: ({ phase, chunk }) => {
          if (phase === 'reasoning') {
            setPlannerModelReasoning(p => p + chunk);
          } else {
            setPlannerModelAssistant(p => p + chunk);
          }
        },
      });
      const n = typeof done?.drafts_generated === 'number' ? done.drafts_generated : 0;
      setPlannerSummary(
        n === 0
          ? 'No drafts were saved — see log above for details (JSON, quotas, RPM, etc.).'
          : `Created ${n} new draft${n === 1 ? '' : 's'}. Refresh the list to review them.`,
      );
      await load();
    } catch (e) {
      setPlannerErr(e.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={handleGenerateNow}
            style={btn.primary}
            disabled={generating || loading}
            title="Same pipeline as the 6 AM cron; adjust prompts and categories in server-php/app/Libraries/BlogAiGenerator.php and .env keys."
          >
            {generating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
            {generating ? 'Generating…' : 'Run generator now'}
          </button>
          <button type="button" onClick={load} style={btn.secondary} title="Refresh" disabled={generating}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
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
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            Use &ldquo;Run generator now&rdquo; to create drafts anytime (same job as the 6 AM cron), or wait for the scheduled run.
          </p>
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
                        <RichTextEditor
                          key={draft.id}
                          defaultValue={editForm.content}
                          onChange={v => setEditForm(f => ({ ...f, content: v }))}
                          placeholder="Paste formatted content from OpenAI or Word, or edit with the toolbar above."
                          style={{ marginTop: 4 }}
                          minHeight={380}
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
                      <div
                        style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, maxHeight: 420, overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{
                          __html: (() => {
                            const cleaned = (draft.content || '').replace(/\\n/g, '\n');
                            return isHtml(cleaned) ? cleaned : markdownToHtml(cleaned);
                          })(),
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Approve consent modal */}
      {approveModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Approve & publish draft</h3>
              <button onClick={() => { setApproveModal(null); setApproveError(''); }} style={btn.icon} disabled={approving}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              "{approveModal.title}"
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
              This will create a published blog post on the marketing site.
              Would you also like to notify clients via email and/or post to a WhatsApp Channel?
            </p>

            {/* WA Channel selector */}
            {waChannels.length > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Radio size={14} color="#16a34a" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>Post to WhatsApp Channel</span>
                </div>
                <select
                  value={selectedWaChannel}
                  onChange={e => setSelectedWaChannel(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #86efac', borderRadius: 7, fontSize: 13, color: '#15803d', background: '#fff', cursor: 'pointer' }}
                >
                  <option value="">— Don't post to WA channel —</option>
                  {waChannels.map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.name || ch.id}</option>
                  ))}
                </select>
                {selectedWaChannel && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#16a34a' }}>
                    The blog title and link will be posted to this channel when you approve.
                  </p>
                )}
              </div>
            )}

            {waChannels.length === 0 && (
              <div style={{ background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Radio size={13} color="#94a3b8" />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    No WA channels found. Connect WhatsApp and add a channel in the WA Web Marketing tool to enable auto-posting.
                  </span>
                </div>
              </div>
            )}

            {approveError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#fef2f2', color: '#dc2626', marginBottom: 14 }}>
                <AlertCircle size={13} /> {approveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setApproveModal(null); setApproveError(''); }}
                style={btn.secondary}
                disabled={approving}
              >
                Cancel
              </button>
              <button
                onClick={() => doApprove(false, !!selectedWaChannel)}
                style={btn.secondary}
                disabled={approving}
              >
                {approving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Globe size={13} />}
                {selectedWaChannel ? 'Publish + WA only' : 'Publish only'}
              </button>
              <button
                onClick={() => doApprove(true, !!selectedWaChannel)}
                style={btn.primary}
                disabled={approving}
              >
                {approving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={13} />}
                {selectedWaChannel ? 'Publish + Email + WA' : 'Publish & notify clients'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email blast stats modal */}
      {emailResult && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Email blast sent</h3>
              <button onClick={() => setEmailResult(null)} style={btn.icon}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: '#16a34a' }}>
              <CheckCircle2 size={18} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Draft approved and published</span>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
              {emailResult.total === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>No active clients with email found — no emails were sent.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>Emails sent</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{emailResult.sent} / {emailResult.total}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>Status</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 99,
                      background: emailResult.status === 'sent' ? '#f0fdf4' : emailResult.status === 'partial' ? '#fff7ed' : '#fef2f2',
                      color:      emailResult.status === 'sent' ? '#16a34a' : emailResult.status === 'partial' ? '#c2410c'  : '#dc2626',
                    }}>
                      {emailResult.status}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setEmailResult(null)} style={btn.primary}>Close</button>
            </div>
          </div>
        </div>
      )}

      <AiDraftPlannerModal
        open={plannerOpen}
        serverLines={plannerLines}
        modelReasoning={plannerModelReasoning}
        modelAssistant={plannerModelAssistant}
        running={generating}
        summary={plannerSummary}
        errorMsg={plannerErr}
        onClose={() => { setPlannerOpen(false); }}
      />

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
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalStyle = { background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.2)' };
