import { useState, useEffect, useRef } from 'react';
import {
  BookOpen, Plus, Pencil, Trash2, Globe, EyeOff, Upload,
  X, Check, Loader2, Image as ImageIcon, AlertCircle, ChevronDown, Sparkles,
  Mail, CheckCircle2, MessageSquare, RefreshCw,
} from 'lucide-react';
import {
  fetchBlogPosts, createBlogPost, updateBlogPost,
  deleteBlogPost, publishBlogPost, resendBlogEmail, uploadBlogImage, generateAiDraftsStream,
  shareToWaChannel,
} from '../services/blog.service';
import { RichTextEditor } from '../components/RichTextEditor';
import AiDraftPlannerModal from '../components/AiDraftPlannerModal';
import { isHtml, markdownToHtml } from '../../../utils/blogContent';
import { API_BASE_URL } from '../../../constants/config';

const CATEGORIES = [
  { value: 'laws',                  label: 'New Laws & Provisions' },
  { value: 'tax_saving',            label: 'Tax Saving & Tax Planning' },
  { value: 'ai_promotions',         label: 'AI Promotions' },
  { value: 'subsidies_promotions',  label: 'Subsidies Promotions' },
  { value: 'funding_promotions',    label: 'Funding Promotions' },
];

const MOCK_POSTS = [
  {
    id: 1,
    slug: 'ai-in-ca-practice',
    title: 'How AI Is Transforming CA Practices in India',
    excerpt: 'From automated bookkeeping to intelligent compliance checks, discover how AI tools are reshaping the way chartered accountants work.',
    content: `## The AI Revolution in Finance

Artificial Intelligence is no longer a buzzword — it is a practical tool reshaping how chartered accountants and finance professionals work in India.

## What AI Can Do for Your Business

- **Automated bookkeeping** — reconcile transactions in seconds, not hours
- **Intelligent compliance alerts** — never miss a GST filing or TDS deadline
- **Predictive cash flow analysis** — know your liquidity position 30 days in advance
- **Expense categorisation** — AI reads receipts and categorises spend automatically

## Getting Started

The first step is identifying your highest-friction workflows. Where do your staff spend the most manual time? That is usually where AI delivers the fastest return on investment.

## Working With Your CA

An experienced CA can bridge the gap between technology vendors and your real business needs. At CA Rahul Gupta Office we have helped dozens of businesses identify the right AI tools and integrate them seamlessly.`,
    category: 'ai_promotions',
    status: 'published',
    source: 'manual',
    published_at: new Date().toISOString(),
    cover_image_path: '',
    cover_image_url: '',
  },
  {
    id: 2,
    slug: 'new-income-tax-provisions-2025',
    title: 'Key Income Tax Provisions to Know in 2025–26',
    excerpt: 'A concise breakdown of the major amendments in the Union Budget affecting individuals, HUFs and businesses this financial year.',
    content: `## Union Budget 2025–26 at a Glance

The Union Budget introduced several significant changes to direct taxation that every individual and business must understand before filing returns this year.

## Changes for Individual Taxpayers

- **Revised tax slabs** under the new regime now make it more attractive for most salaried employees
- **Standard deduction** increased to ₹75,000 for salaried individuals
- **NPS employer contribution** limit raised to 14% for private-sector employees

## Key Changes for Businesses

- **Presumptive taxation limits** revised upward for small businesses and professionals
- **TDS threshold changes** on various payment categories reduce compliance burden
- **Angel tax** removal for all investor classes simplifies startup funding

## Filing Deadlines to Remember

Ensure you file your ITR on time to avoid penalties. Consult your CA to determine which regime — old or new — results in lower tax for your specific income profile.`,
    category: 'laws',
    status: 'published',
    source: 'manual',
    published_at: new Date().toISOString(),
    cover_image_path: '',
    cover_image_url: '',
  },
  {
    id: 3,
    slug: 'msme-subsidies-guide',
    title: 'Top Government Subsidies for MSMEs You Should Know',
    excerpt: 'Many small businesses miss out on crores in subsidies simply because they are unaware. Here is your complete guide.',
    content: `## Why MSMEs Miss Out on Subsidies

Lack of awareness is the single biggest reason small and medium businesses fail to claim government benefits they are fully entitled to.

## Major Subsidy Schemes in 2025

- **CGTMSE** — Collateral-free credit up to ₹2 crore for micro and small enterprises
- **PMEGP** — Capital subsidy of 15–35% on project cost for new manufacturing units
- **TReDS** — Invoice financing platform ensuring MSMEs are paid on time by large buyers
- **PLI Scheme** — Production-linked incentives across 14 sectors including textiles and food processing

## How to Apply

Most schemes are administered through the Udyam portal. Ensure your MSME registration is current and your GST filings are up to date before applying.

## Getting Expert Help

A CA with MSME expertise can identify which schemes your business qualifies for and manage the documentation process end to end. Contact our office to schedule a free eligibility assessment.`,
    category: 'subsidies_promotions',
    status: 'published',
    source: 'manual',
    published_at: new Date().toISOString(),
    cover_image_path: '',
    cover_image_url: '',
  },
];

const STATUS_STYLES = {
  published: { background: '#f0fdf4', color: '#16a34a' },
  draft:     { background: '#f8fafc', color: '#64748b' },
};

const CATEGORY_STYLES = {
  laws:                 { background: '#eff6ff', color: '#2563eb' },
  tax_saving:           { background: '#fef3c7', color: '#d97706' },
  ai_promotions:        { background: '#f3e8ff', color: '#7c3aed' },
  subsidies_promotions: { background: '#ecfdf5', color: '#059669' },
  funding_promotions:   { background: '#fff7ed', color: '#c2410c' },
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const BLAST_STATUS_META = {
  sent: { label: 'All sent', color: '#16a34a', bg: '#f0fdf4' },
  partial: { label: 'Partial', color: '#ca8a04', bg: '#fefce8' },
  failed: { label: 'Failed', color: '#dc2626', bg: '#fef2f2' },
  no_recipients: { label: 'No recipients', color: '#64748b', bg: '#f8fafc' },
};

/** Latest completed blast from API (`email_last_blast`); not live progress during an in-flight send. */
function EmailBlastCell({ post, isMock }) {
  if (post.status !== 'published') {
    return <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>;
  }
  if (isMock) {
    return <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>;
  }
  const blast = post.email_last_blast;
  if (!blast) {
    return <span style={{ fontSize: 12, color: '#94a3b8' }}>Not sent yet</span>;
  }
  const { sent, total, status, sent_at: sentAt } = blast;
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  const meta = BLAST_STATUS_META[status] ?? { label: status || '—', color: '#64748b', bg: '#f8fafc' };

  return (
    <div style={{ minWidth: 148, maxWidth: 220 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
          {sent}/{total}
          <span style={{ fontWeight: 400, color: '#94a3b8' }}> sent</span>
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 4,
          color: meta.color,
          background: meta.bg,
        }}>
          {meta.label}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 3,
          background: status === 'failed' ? '#dc2626' : status === 'partial' ? '#eab308' : '#22c55e',
          transition: 'width 0.25s ease',
        }}
        />
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
        Last: {formatDateTime(sentAt)}
      </div>
    </div>
  );
}

const emptyForm = { title: '', excerpt: '', content: '', category: 'laws', cover_image_path: '' };

function applyFilters(posts, category, status) {
  return posts.filter(p =>
    (!category || p.category === category) &&
    (!status   || p.status   === status)
  );
}

export default function BlogManagement() {
  const [posts, setPosts]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [isMock, setIsMock]         = useState(false);
  const [filterCat, setFilterCat]   = useState('');
  const [filterSt, setFilterSt]     = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [uploading, setUploading]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [publishModal, setPublishModal] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [emailResult, setEmailResult] = useState(null);
  const [resendModal, setResendModal] = useState(null);
  const [resending, setResending]     = useState(false);
  const [resendError, setResendError] = useState('');
  const [waShareModal, setWaShareModal]     = useState(null);
  const [waChannels, setWaChannels]         = useState([]);
  const [waChannelsLoading, setWaChannelsLoading] = useState(false);
  const [waSelectedChannel, setWaSelectedChannel] = useState('');
  const [waSending, setWaSending]           = useState(false);
  const [waShareError, setWaShareError]     = useState('');
  const [waShareSuccess, setWaShareSuccess] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerLines, setPlannerLines] = useState([]);
  const [plannerModelReasoning, setPlannerModelReasoning] = useState('');
  const [plannerModelAssistant, setPlannerModelAssistant] = useState('');
  const [plannerSummary, setPlannerSummary] = useState(null);
  const [plannerErr, setPlannerErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const fileRef = useRef();

  const load = async (opts = {}) => {
    const silent = !!opts.silent;
    if (silent) setRefreshing(true);
    else {
      setLoading(true);
      setError('');
    }
    try {
      const res = await fetchBlogPosts({ category: filterCat, status: filterSt });
      const list = res.data ?? [];
      if (list.length === 0 && !import.meta.env.VITE_API_BASE_URL) {
        setPosts(applyFilters(MOCK_POSTS, filterCat, filterSt));
        setIsMock(true);
      } else {
        setPosts(list);
        setIsMock(false);
      }
    } catch (e) {
      if (!import.meta.env.VITE_API_BASE_URL) {
        setPosts(applyFilters(MOCK_POSTS, filterCat, filterSt));
        setIsMock(true);
      } else if (!silent) {
        setError(e.message);
      }
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterCat, filterSt]);

  const openNew = () => {
    setEditingPost(null);
    setForm(emptyForm);
    setCoverPreview('');
    setSaveError('');
    setShowEditor(true);
  };

  const openEdit = (post) => {
    setEditingPost(post);
    const raw = (post.content || '').replace(/\\n/g, '\n');
    const content = raw
      ? (isHtml(raw) ? raw : markdownToHtml(raw))
      : '';
    setForm({
      title: post.title,
      excerpt: post.excerpt ?? '',
      content,
      category: post.category,
      cover_image_path: post.cover_image_path ?? '',
    });
    setCoverPreview(post.cover_image_url ?? '');
    setSaveError('');
    setShowEditor(true);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadBlogImage(file);
      setForm(f => ({ ...f, cover_image_path: res.data.path }));
      setCoverPreview(res.data.url);
    } catch (e) {
      setSaveError('Image upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim())   return setSaveError('Title is required.');
    if (!form.content.trim()) return setSaveError('Content is required.');
    setSaving(true); setSaveError('');
    try {
      if (editingPost) {
        await updateBlogPost(editingPost.id, form);
      } else {
        await createBlogPost(form);
      }
      setShowEditor(false);
      load();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = (post) => {
    setPublishError('');
    setPublishModal(post);
  };

  const doPublish = async (sendEmail) => {
    if (!publishModal) return;
    setPublishing(true);
    setPublishError('');
    try {
      const res = await publishBlogPost(publishModal.id, sendEmail);
      setPublishModal(null);
      if (sendEmail && res?.data?.email) {
        setEmailResult({ postTitle: publishModal.title, ...res.data.email });
      }
      load();
    } catch (e) {
      setPublishError(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteBlogPost(id);
      setConfirmDelete(null);
      load();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  const handleResendEmail = async () => {
    if (!resendModal) return;
    setResending(true);
    setResendError('');
    try {
      const res = await resendBlogEmail(resendModal.id);
      setResendModal(null);
      if (res?.data?.email) {
        setEmailResult({ postTitle: resendModal.title, ...res.data.email });
      }
      await load({ silent: true });
    } catch (e) {
      setResendError(e.message);
    } finally {
      setResending(false);
    }
  };

  const openWaShare = async (post) => {
    setWaShareError('');
    setWaShareSuccess(false);
    setWaSelectedChannel('');
    setWaShareModal(post);
    setWaChannelsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${API_BASE_URL}/marketing/wa/channels`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list = json.data ?? [];
        setWaChannels(list);
        if (list.length === 1) setWaSelectedChannel(list[0].id);
      } else {
        setWaChannels([]);
        setWaShareError('Could not load channels. Make sure WhatsApp is connected in WA Web Marketing.');
      }
    } catch {
      setWaChannels([]);
      setWaShareError('Could not load channels. Make sure the WA bridge is running.');
    } finally {
      setWaChannelsLoading(false);
    }
  };

  const doWaShare = async () => {
    if (!waShareModal || !waSelectedChannel) return;
    setWaSending(true);
    setWaShareError('');
    try {
      await shareToWaChannel(waShareModal.id, waSelectedChannel);
      setWaShareSuccess(true);
    } catch (e) {
      setWaShareError(e.message);
    } finally {
      setWaSending(false);
    }
  };

  const handlePlanNow = async () => {
    if (!window.confirm(
      'Run the AI blog generator now?\n\n'
      + 'This uses the same process as the daily 6 AM cron job: new topics and drafts '
      + 'from OpenAI, plus cover images when enabled. It can take several minutes.\n\n'
      + 'New drafts will appear in the AI Approvals page for review.',
    )) return;

    setPlannerOpen(true);
    setPlannerLines([]);
    setPlannerModelReasoning('');
    setPlannerModelAssistant('');
    setPlannerSummary(null);
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
          ? 'No drafts were saved — see log above for details (JSON parse, quotas, RPM, etc.).'
          : `Created ${n} new draft${n === 1 ? '' : 's'}. Go to AI Approvals to review them.`,
      );
    } catch (e) {
      setPlannerErr(e.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Blog Management</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Create, edit and publish blog articles to the marketing site
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handlePlanNow}
            style={btn.secondary}
            disabled={generating || loading}
            title="Same pipeline as the 6 AM cron — generates AI drafts via OpenAI for review in AI Approvals."
          >
            {generating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
            {generating ? 'Planning…' : 'Plan now'}
          </button>
          <button onClick={openNew} style={btn.primary}>
            <Plus size={14} /> New Post
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18, alignItems: 'center' }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={sel}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value)} style={sel}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <button
          type="button"
          onClick={() => load({ silent: true })}
          disabled={loading || refreshing || isMock}
          style={{ ...btn.secondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          title="Reload posts and latest email blast stats from the server"
        >
          <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          Refresh
        </button>
        {!isMock && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Email column shows the last completed blast (sent vs total). Use Refresh after sending.
          </span>
        )}
      </div>

      {/* Mock mode banner */}
      {isMock && (
        <div style={{ ...alertBox, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', marginBottom: 16 }}>
          <AlertCircle size={14} />
          Preview mode — showing sample posts. Connect the backend to manage real content.
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ ...alertBox, background: '#fef2f2', color: '#dc2626', marginBottom: 16 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <BookOpen size={36} style={{ marginBottom: 12 }} />
          <p style={{ margin: 0 }}>No blog posts yet. Create your first post!</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                {['Title', 'Category', 'Status', 'Published', 'Email blast', 'Source', 'Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{post.title}</div>
                    {post.excerpt && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {post.excerpt}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ ...badge, ...CATEGORY_STYLES[post.category] }}>
                      {CATEGORIES.find(c => c.value === post.category)?.label ?? post.category}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ ...badge, ...STATUS_STYLES[post.status] }}>
                      {post.status}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{formatDate(post.published_at)}</td>
                  <td style={{ ...td, verticalAlign: 'middle' }}>
                    <EmailBlastCell post={post} isMock={isMock} />
                  </td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{post.source}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(post)} style={btn.icon} title="Edit">
                      <Pencil size={14} />
                    </button>
                    {post.status !== 'published' && (
                      <button onClick={() => handlePublish(post)} style={{ ...btn.icon, color: '#16a34a' }} title="Publish">
                        <Globe size={14} />
                      </button>
                    )}
                    {post.status === 'published' && (
                      <button
                        onClick={() => { setResendError(''); setResendModal(post); }}
                        style={{ ...btn.icon, color: '#2563eb' }}
                        title="Re-send email notification to all active clients"
                      >
                        <Mail size={14} />
                      </button>
                    )}
                    {post.status === 'published' && (
                      <button
                        onClick={() => openWaShare(post)}
                        style={{ ...btn.icon, color: '#25d366' }}
                        title="Share to WhatsApp Channel"
                      >
                        <MessageSquare size={14} />
                      </button>
                    )}
                    <button onClick={() => setConfirmDelete(post)} style={{ ...btn.icon, color: '#dc2626' }} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#0f172a' }}>Delete post?</h3>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
              "{confirmDelete.title}" will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={btn.secondary}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete.id)} style={{ ...btn.primary, background: '#dc2626' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Publish consent modal */}
      {publishModal && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Publish post</h3>
              <button onClick={() => { setPublishModal(null); setPublishError(''); }} style={btn.icon} disabled={publishing}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              "{publishModal.title}"
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
              The post will be made publicly available on the marketing site.
              Would you also like to send an email notification to all active clients?
            </p>
            {publishError && (
              <div style={{ ...alertBox, background: '#fef2f2', color: '#dc2626', marginBottom: 14 }}>
                <AlertCircle size={13} /> {publishError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setPublishModal(null); setPublishError(''); }}
                style={btn.secondary}
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                onClick={() => doPublish(false)}
                style={btn.secondary}
                disabled={publishing}
              >
                {publishing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Globe size={13} />}
                Publish only
              </button>
              <button
                onClick={() => doPublish(true)}
                style={btn.primary}
                disabled={publishing}
              >
                {publishing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={13} />}
                Publish & notify clients
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resend email confirmation modal */}
      {resendModal && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Re-send email notification</h3>
              <button onClick={() => { setResendModal(null); setResendError(''); }} style={btn.icon} disabled={resending}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              "{resendModal.title}"
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
              This will re-send the blog notification email to all active clients.
              Use this if some clients missed the original email or if the email service was unavailable at publish time.
            </p>
            {resendError && (
              <div style={{ ...alertBox, background: '#fef2f2', color: '#dc2626', marginBottom: 14 }}>
                <AlertCircle size={13} /> {resendError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setResendModal(null); setResendError(''); }} style={btn.secondary} disabled={resending}>
                Cancel
              </button>
              <button onClick={handleResendEmail} style={btn.primary} disabled={resending}>
                {resending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={13} />}
                {resending ? 'Sending…' : 'Send email now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WA Channel share modal */}
      {waShareModal && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Share to WhatsApp Channel</h3>
              <button
                onClick={() => { setWaShareModal(null); setWaShareSuccess(false); setWaShareError(''); }}
                style={btn.icon}
                disabled={waSending}
              >
                <X size={16} />
              </button>
            </div>

            {waShareSuccess ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', marginBottom: 20 }}>
                  <CheckCircle2 size={18} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Post shared to WhatsApp channel!</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setWaShareModal(null); setWaShareSuccess(false); }}
                    style={btn.primary}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                  "{waShareModal.title}"
                </p>
                <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                  Select a saved WhatsApp channel to share this post. The message will include the title, excerpt and a link.
                </p>

                {waChannelsLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', marginBottom: 18, fontSize: 13 }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading channels…
                  </div>
                ) : waChannels.length === 0 ? (
                  <div style={{ ...alertBox, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', marginBottom: 14 }}>
                    <AlertCircle size={13} />
                    No channels saved. Add a channel in WA Web Marketing first.
                  </div>
                ) : (
                  <div style={{ marginBottom: 18 }}>
                    <label style={lbl}>Channel</label>
                    <select
                      style={{ ...inp, cursor: 'pointer' }}
                      value={waSelectedChannel}
                      onChange={e => setWaSelectedChannel(e.target.value)}
                    >
                      <option value="">— select a channel —</option>
                      {waChannels.map(ch => (
                        <option key={ch.id} value={ch.id}>{ch.name || ch.id}</option>
                      ))}
                    </select>
                  </div>
                )}

                {waShareError && (
                  <div style={{ ...alertBox, background: '#fef2f2', color: '#dc2626', marginBottom: 14 }}>
                    <AlertCircle size={13} /> {waShareError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setWaShareModal(null); setWaShareError(''); }}
                    style={btn.secondary}
                    disabled={waSending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doWaShare}
                    style={{ ...btn.primary, background: '#25d366' }}
                    disabled={waSending || !waSelectedChannel}
                  >
                    {waSending
                      ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      : <MessageSquare size={13} />}
                    {waSending ? 'Sending…' : 'Share to channel'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Email blast stats modal */}
      {emailResult && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Email blast sent</h3>
              <button onClick={() => setEmailResult(null)} style={btn.icon}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: '#16a34a' }}>
              <CheckCircle2 size={18} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Post published successfully</span>
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

      {/* Blog Editor Modal */}
      {showEditor && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>
                {editingPost ? 'Edit Post' : 'New Blog Post'}
              </h2>
              <button onClick={() => setShowEditor(false)} style={btn.icon}><X size={18} /></button>
            </div>

            {saveError && (
              <div style={{ ...alertBox, background: '#fef2f2', color: '#dc2626', marginBottom: 14 }}>
                <AlertCircle size={14} /> {saveError}
              </div>
            )}

            <label style={lbl}>Title *</label>
            <input
              style={inp}
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Enter a clear, SEO-friendly title"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '14px 0' }}>
              <div>
                <label style={lbl}>Category *</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Cover Image</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    style={{ ...btn.secondary, flex: 1, justifyContent: 'center' }}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                    {uploading ? 'Uploading…' : 'Upload Image'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                  {coverPreview && (
                    <button type="button" onClick={() => { setCoverPreview(''); setForm(f => ({ ...f, cover_image_path: '' })); }} style={{ ...btn.icon, color: '#dc2626' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                {coverPreview && (
                  <img src={coverPreview} alt="cover" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6, marginTop: 8 }} />
                )}
              </div>
            </div>

            <label style={lbl}>Excerpt <span style={{ color: '#94a3b8', fontWeight: 400 }}>(short summary shown in listing)</span></label>
            <textarea
              style={{ ...inp, height: 60, resize: 'vertical' }}
              value={form.excerpt}
              onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
              placeholder="2–3 sentence summary of the article"
            />

            <label style={{ ...lbl, marginTop: 14 }}>Content *</label>
            <RichTextEditor
              key={editingPost?.id ?? 'new'}
              defaultValue={form.content}
              onChange={v => setForm(f => ({ ...f, content: v }))}
              placeholder="Paste formatted content from OpenAI or Word, or type and use the toolbar above."
              style={{ marginTop: 4 }}
            />

            {/* CTA preview */}
            <div style={{
              marginTop: 20, borderRadius: 10, overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{
                background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Mail size={13} style={{ color: '#F37920' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                  CTA section — shown below every published post
                </span>
              </div>
              <div style={{
                background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 60%, #F37920 100%)',
                padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                    AI for Business
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                    Want to implement AI in your business?
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                    CA Rahul Gupta Office helps businesses identify, integrate and automate with AI.
                  </div>
                </div>
                <div style={{
                  background: '#fff', color: '#1e3a5f', borderRadius: 8, padding: '8px 16px',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  Contact us →
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowEditor(false)} style={btn.secondary}>Cancel</button>
              <button onClick={handleSave} style={btn.primary} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
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

// ── Inline styles ────────────────────────────────────────────────────────────

const btn = {
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#F37920', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 16px', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
  secondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '7px 14px', fontSize: 13,
    fontWeight: 500, cursor: 'pointer',
  },
  icon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#64748b', padding: '4px 6px', borderRadius: 6,
  },
};

const th = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' };
const td = { padding: '12px 16px', fontSize: 13, color: '#334155', verticalAlign: 'middle' };
const badge = { display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 };
const sel = { padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#334155', background: '#fff', cursor: 'pointer' };
const alertBox = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, fontSize: 13 };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modal = { background: '#fff', borderRadius: 14, padding: 28, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' };
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 };
const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
