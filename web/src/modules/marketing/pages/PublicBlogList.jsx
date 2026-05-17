/**
 * PublicBlogList.jsx
 *
 * Public blog listing page — accessible without login at /blog.
 * Shows published articles from the backend and a BlogCTA section.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicBlogPosts } from '../services/blog.service';
import BlogCTA from '../components/BlogCTA';

const CATEGORIES = [
  { value: '',                     label: 'All Topics' },
  { value: 'laws',                 label: 'New Laws & Provisions' },
  { value: 'tax_saving',           label: 'Tax Saving & Planning' },
  { value: 'ai_promotions',        label: 'AI for Business' },
  { value: 'subsidies_promotions', label: 'Subsidies & Promotions' },
  { value: 'funding_promotions',   label: 'Funding & Growth' },
];

const CATEGORY_STYLES = {
  laws:                 { background: '#eff6ff', color: '#2563eb' },
  tax_saving:           { background: '#fef3c7', color: '#d97706' },
  ai_promotions:        { background: '#f3e8ff', color: '#7c3aed' },
  subsidies_promotions: { background: '#ecfdf5', color: '#059669' },
  funding_promotions:   { background: '#fff7ed', color: '#c2410c' },
};

function categoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label ?? value;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const MOCK_POSTS = [
  {
    id: 1, slug: 'ai-in-ca-practice',
    title: 'How AI Is Transforming CA Practices in India',
    excerpt: 'From automated bookkeeping to intelligent compliance checks, discover how AI tools are reshaping the way chartered accountants work.',
    category: 'ai_promotions',
    published_at: new Date().toISOString(),
    author_name: 'CA Rahul Gupta',
    cover_image_url: '',
  },
  {
    id: 2, slug: 'new-income-tax-provisions-2025',
    title: 'Key Income Tax Provisions to Know in 2025–26',
    excerpt: 'A concise breakdown of the major amendments in the Union Budget affecting individuals, HUFs and businesses this financial year.',
    category: 'laws',
    published_at: new Date().toISOString(),
    author_name: 'CA Rahul Gupta',
    cover_image_url: '',
  },
  {
    id: 3, slug: 'msme-subsidies-guide',
    title: 'Top Government Subsidies for MSMEs You Should Know',
    excerpt: 'Many small businesses miss out on crores in subsidies simply because they are unaware. Here is your complete guide.',
    category: 'subsidies_promotions',
    published_at: new Date().toISOString(),
    author_name: 'CA Rahul Gupta',
    cover_image_url: '',
  },
];

export default function PublicBlogList() {
  const [posts, setPosts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [category, setCategory] = useState('');
  const [isMock, setIsMock]     = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPublicBlogPosts({ category })
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
        if (list.length === 0 && !import.meta.env.VITE_API_BASE_URL) {
          setPosts(MOCK_POSTS);
          setIsMock(true);
        } else {
          setPosts(list);
          setIsMock(false);
        }
      })
      .catch(() => {
        if (!import.meta.env.VITE_API_BASE_URL) {
          setPosts(MOCK_POSTS);
          setIsMock(true);
        } else {
          setPosts([]);
        }
      })
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <div style={s.page}>
      {/* ── Nav bar ────────────────────────────────────────────────────── */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <Link to="/" style={s.navLogo}>
            <span style={s.navLogoAccent}>CA</span> Rahul Gupta
          </Link>
          <div style={s.navLinks}>
            <Link to="/blog" style={s.navLink}>Blog</Link>
            <Link to="/login" style={s.navLogin}>Staff login</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <header style={s.hero}>
        <div style={s.heroInner}>
          <p style={s.heroEyebrow}>Insights from CA Rahul Gupta Office</p>
          <h1 style={s.heroTitle}>Tax, Finance & Business Intelligence</h1>
          <p style={s.heroSubtitle}>
            Articles on new tax laws, AI for business, funding opportunities and
            smarter financial management for Indian businesses.
          </p>
        </div>
      </header>

      <div style={s.container}>
        {isMock && (
          <div style={s.mockBanner}>
            Preview mode — showing sample articles. Connect the backend to see real content.
          </div>
        )}

        {/* ── Category filter tabs ──────────────────────────────────────── */}
        <div style={s.filterRow}>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              style={{
                ...s.filterBtn,
                ...(category === c.value ? s.filterBtnActive : {}),
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* ── Post grid ─────────────────────────────────────────────────── */}
        {loading ? (
          <div style={s.loadingBox}>
            <div style={s.spinner} />
            <p style={{ margin: '12px 0 0', color: '#94a3b8', fontSize: 14 }}>Loading articles…</p>
          </div>
        ) : posts.length === 0 ? (
          <div style={s.emptyBox}>
            <p style={{ margin: 0, color: '#64748b', fontSize: 15 }}>No articles published yet. Check back soon!</p>
          </div>
        ) : (
          <div style={s.grid}>
            {posts.map(post => (
              <Link key={post.id} to={`/blog/${post.slug}`} style={s.card}>
                {post.cover_image_url ? (
                  <img src={post.cover_image_url} alt={post.title} style={s.cardImg} />
                ) : (
                  <div style={{ ...s.cardImg, ...s.cardImgPlaceholder }}>
                    <span style={{ fontSize: 32, opacity: 0.4 }}>📄</span>
                  </div>
                )}
                <div style={s.cardBody}>
                  <div style={s.cardMeta}>
                    <span style={{ ...s.catBadge, ...CATEGORY_STYLES[post.category] }}>
                      {categoryLabel(post.category)}
                    </span>
                    <span style={s.cardDate}>{formatDate(post.published_at)}</span>
                  </div>
                  <h2 style={s.cardTitle}>{post.title}</h2>
                  {post.excerpt && (
                    <p style={s.cardExcerpt}>{post.excerpt}</p>
                  )}
                  <div style={s.cardFooter}>
                    <span style={s.cardAuthor}>{post.author_name || 'CA Rahul Gupta'}</span>
                    <span style={s.readMore}>Read more →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── CTA section ───────────────────────────────────────────────── */}
        <BlogCTA />

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer style={s.footer}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
            © {new Date().getFullYear()} CA Rahul Gupta Office &bull; All rights reserved
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes blog-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  // Nav
  nav: {
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  navInner: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '0 24px',
    height: 58,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLogo: {
    fontSize: 18,
    fontWeight: 800,
    color: '#0f172a',
    textDecoration: 'none',
    letterSpacing: '-0.02em',
  },
  navLogoAccent: {
    color: '#F37920',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  navLink: {
    fontSize: 14,
    fontWeight: 500,
    color: '#475569',
    textDecoration: 'none',
  },
  navLogin: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F37920',
    textDecoration: 'none',
    padding: '6px 14px',
    border: '1px solid #F37920',
    borderRadius: 8,
  },

  // Hero
  hero: {
    background: 'linear-gradient(160deg, #1e3a5f 0%, #2d5a8e 100%)',
    padding: '64px 24px 56px',
    textAlign: 'center',
  },
  heroInner: {
    maxWidth: 680,
    margin: '0 auto',
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
    margin: '0 0 14px',
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 900,
    color: '#fff',
    margin: '0 0 14px',
    lineHeight: 1.15,
    letterSpacing: '-0.03em',
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    margin: 0,
    lineHeight: 1.6,
  },

  // Container
  container: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '32px 24px 60px',
  },

  // Mock banner
  mockBanner: {
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    color: '#c2410c',
    padding: '10px 16px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 20,
  },

  // Filter tabs
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 28,
  },
  filterBtn: {
    padding: '7px 16px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 500,
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: '#1e3a5f',
    borderColor: '#1e3a5f',
    color: '#fff',
    fontWeight: 600,
  },

  // Grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 24,
    marginBottom: 8,
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    transition: 'box-shadow 0.2s, transform 0.2s',
  },
  cardImg: {
    width: '100%',
    height: 180,
    objectFit: 'cover',
    display: 'block',
  },
  cardImgPlaceholder: {
    background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: '18px 20px 16px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  catBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 99,
  },
  cardDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  cardTitle: {
    margin: '0 0 8px',
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    lineHeight: 1.35,
    letterSpacing: '-0.01em',
  },
  cardExcerpt: {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#64748b',
    lineHeight: 1.6,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    flex: 1,
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 12,
    borderTop: '1px solid #f1f5f9',
  },
  cardAuthor: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 500,
  },
  readMore: {
    fontSize: 12,
    fontWeight: 700,
    color: '#F37920',
  },

  // States
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '80px 0',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #e2e8f0',
    borderTopColor: '#F37920',
    borderRadius: '50%',
    animation: 'blog-spin 0.8s linear infinite',
  },
  emptyBox: {
    textAlign: 'center',
    padding: '80px 0',
  },

  // Footer
  footer: {
    textAlign: 'center',
    marginTop: 56,
    paddingTop: 24,
    borderTop: '1px solid #e2e8f0',
  },
};
