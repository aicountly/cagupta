import { useState, useEffect, useRef } from 'react';
import {
  BookOpen, Plus, Pencil, Trash2, Globe, EyeOff, Upload,
  X, Check, Loader2, Image as ImageIcon, AlertCircle, ChevronDown, Sparkles,
} from 'lucide-react';
import {
  fetchBlogPosts, createBlogPost, updateBlogPost,
  deleteBlogPost, publishBlogPost, uploadBlogImage, generateAiDraftsNow,
} from '../services/blog.service';

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
  const fileRef = useRef();

  const load = async () => {
    setLoading(true); setError('');
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
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
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
    setForm({
      title: post.title,
      excerpt: post.excerpt ?? '',
      content: post.content,
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

  const handlePublish = async (post) => {
    if (!window.confirm(`Publish "${post.title}"? An email will be sent to all active clients.`)) return;
    try {
      await publishBlogPost(post.id);
    } catch (e) {
      alert('Publish failed: ' + e.message);
    } finally {
      load();
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

  const handlePlanNow = async () => {
    if (!window.confirm(
      'Run the AI blog generator now?\n\n'
      + 'This uses the same process as the daily 6 AM cron job: new topics and drafts '
      + 'from OpenAI, plus cover images when enabled. It can take several minutes.\n\n'
      + 'New drafts will appear in the AI Approvals page for review.',
    )) return;
    setGenerating(true);
    setError('');
    try {
      const res = await generateAiDraftsNow({});
      const n = res?.data?.drafts_generated ?? 0;
      const msg = n === 0
        ? 'Generator finished — no drafts were saved (check server logs / OpenAI key in .env).'
        : `Created ${n} new draft${n === 1 ? '' : 's'}. Go to AI Approvals to review them.`;
      alert(`${res.message || 'Done'}\n\n${msg}`);
    } catch (e) {
      setError(e.message);
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={sel}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value)} style={sel}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
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
                {['Title', 'Category', 'Status', 'Published', 'Source', 'Actions'].map(h => (
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

            <label style={{ ...lbl, marginTop: 14 }}>Content * <span style={{ color: '#94a3b8', fontWeight: 400 }}>(use ## for H2 subheadings)</span></label>
            <textarea
              style={{ ...inp, height: 340, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Write your article here. Use ## Heading for section headings."
            />

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
