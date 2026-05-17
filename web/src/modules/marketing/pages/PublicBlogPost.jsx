/**
 * PublicBlogPost.jsx
 *
 * Public single blog post page — accessible without login at /blog/:slug.
 * Renders the full article with a BlogCTA section at the bottom.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchPublicBlogPost } from '../services/blog.service';
import BlogCTA from '../components/BlogCTA';

const CATEGORY_STYLES = {
  laws:                 { background: '#eff6ff', color: '#2563eb' },
  tax_saving:           { background: '#fef3c7', color: '#d97706' },
  ai_promotions:        { background: '#f3e8ff', color: '#7c3aed' },
  subsidies_promotions: { background: '#ecfdf5', color: '#059669' },
  funding_promotions:   { background: '#fff7ed', color: '#c2410c' },
};

const CATEGORY_LABELS = {
  laws:                 'New Laws & Provisions',
  tax_saving:           'Tax Saving & Planning',
  ai_promotions:        'AI for Business',
  subsidies_promotions: 'Subsidies & Promotions',
  funding_promotions:   'Funding & Growth',
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * Minimal markdown-to-HTML renderer.
 * Handles: ## h2, ### h3, **bold**, *italic*, [link](url), unordered lists, paragraphs.
 */
function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let listBuf = [];

  function flushList() {
    if (listBuf.length === 0) return;
    out.push(`<ul style="margin:0 0 18px;padding-left:24px;color:#334155;line-height:1.75;font-size:15px">${
      listBuf.map(item => `<li>${item}</li>`).join('')
    }</ul>`);
    listBuf = [];
  }

  function inlineFormat(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#F37920;text-decoration:underline" target="_blank" rel="noopener">$1</a>');
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('### ')) {
      flushList();
      out.push(`<h3 style="font-size:18px;font-weight:700;color:#0f172a;margin:28px 0 10px;letter-spacing:-0.01em">${inlineFormat(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2 style="font-size:22px;font-weight:800;color:#0f172a;margin:36px 0 12px;letter-spacing:-0.02em">${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      flushList();
      out.push(`<h1 style="font-size:28px;font-weight:900;color:#0f172a;margin:0 0 16px;letter-spacing:-0.03em">${inlineFormat(line.slice(2))}</h1>`);
    } else if (/^[-*] /.test(line)) {
      listBuf.push(inlineFormat(line.slice(2)));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      out.push(`<p style="font-size:15px;color:#334155;line-height:1.8;margin:0 0 18px;text-align:justify">${inlineFormat(line)}</p>`);
    }
  }

  flushList();
  return out.join('\n');
}

const MOCK_POST = {
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
  published_at: new Date().toISOString(),
  author_name: 'CA Rahul Gupta',
  cover_image_url: '',
};

export default function PublicBlogPost() {
  const { slug } = useParams();
  const [post, setPost]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetchPublicBlogPost(slug)
      .then(res => {
        const p = res.data ?? res;
        setPost(p);
      })
      .catch(() => {
        if (!import.meta.env.VITE_API_BASE_URL) {
          setPost(MOCK_POST);
        } else {
          setNotFound(true);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Inject OG / Twitter meta tags into <head> once post data is loaded.
  // This covers browsers' native share sheets and in-app browsers that
  // do execute JS (unlike WhatsApp's link-preview bot, which is handled
  // server-side via prerender.php + .htaccess bot detection).
  useEffect(() => {
    if (!post) return;

    const siteName = 'CA Rahul Gupta — Chartered Accountants';
    const url      = window.location.href;

    const tags = [
      { property: 'og:type',        content: 'article' },
      { property: 'og:site_name',   content: siteName },
      { property: 'og:url',         content: url },
      { property: 'og:title',       content: post.title || siteName },
      { property: 'og:description', content: post.excerpt || '' },
      { property: 'og:image',       content: post.cover_image_url || '' },
      { name: 'twitter:card',        content: 'summary_large_image' },
      { name: 'twitter:title',       content: post.title || siteName },
      { name: 'twitter:description', content: post.excerpt || '' },
      { name: 'twitter:image',       content: post.cover_image_url || '' },
    ];

    const inserted = [];
    tags.forEach(attrs => {
      if (!attrs.content) return;
      const key   = attrs.property ?? attrs.name;
      const attr  = attrs.property ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        document.head.appendChild(el);
        inserted.push(el);
      }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    });

    const prevTitle   = document.title;
    document.title    = post.title || siteName;

    return () => {
      document.title = prevTitle;
      inserted.forEach(el => el.parentNode?.removeChild(el));
    };
  }, [post]);

  return (
    <div style={s.page}>
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <Link to="/" style={s.navLogo}>
            <span style={s.navLogoAccent}>CA</span> Rahul Gupta
          </Link>
          <div style={s.navLinks}>
            <Link to="/blog" style={s.navLink}>← All Articles</Link>
            <Link to="/login" style={s.navLogin}>Staff login</Link>
          </div>
        </div>
      </nav>

      <style>{`
        @keyframes blog-spin { from { transform:rotate(0); } to { transform:rotate(360deg); } }
        .article-body p { text-align: justify !important; }
        .article-body li { text-align: justify; }
      `}</style>

      {loading && (
        <div style={s.center}>
          <div style={s.spinner} />
          <p style={{ margin: '14px 0 0', color: '#94a3b8', fontSize: 14 }}>Loading article…</p>
        </div>
      )}

      {!loading && notFound && (
        <div style={s.center}>
          <p style={{ fontSize: 48, margin: '0 0 12px' }}>📄</p>
          <h2 style={{ margin: '0 0 10px', color: '#0f172a' }}>Article not found</h2>
          <p style={{ color: '#64748b', margin: '0 0 24px' }}>
            This post may have been removed or the link is incorrect.
          </p>
          <Link to="/blog" style={s.backBtn}>← Back to all articles</Link>
        </div>
      )}

      {!loading && post && (
        <div style={s.container}>
          {/* Breadcrumb */}
          <div style={s.breadcrumb}>
            <Link to="/blog" style={s.breadLink}>Blog</Link>
            <span style={s.breadSep}>/</span>
            <span style={s.breadCurrent}>{post.title}</span>
          </div>

          <article style={s.article}>
            {/* Category + date */}
            <div style={s.articleMeta}>
              {post.category && (
                <span style={{ ...s.catBadge, ...CATEGORY_STYLES[post.category] }}>
                  {CATEGORY_LABELS[post.category] ?? post.category}
                </span>
              )}
              <span style={s.articleDate}>{formatDate(post.published_at)}</span>
            </div>

            {/* Title */}
            <h1 style={s.articleTitle}>{post.title}</h1>

            {/* Excerpt */}
            {post.excerpt && (
              <p style={s.articleExcerpt}>{post.excerpt}</p>
            )}

            {/* Author */}
            <div style={s.authorRow}>
              <div style={s.authorAvatar}>
                {(post.author_name || 'CA')[0].toUpperCase()}
              </div>
              <div>
                <div style={s.authorName}>{post.author_name || 'CA Rahul Gupta'}</div>
                <div style={s.authorRole}>Chartered Accountant</div>
              </div>
            </div>

            {/* Cover image */}
            {post.cover_image_url && (
              <img
                src={post.cover_image_url}
                alt={post.title}
                style={s.coverImg}
              />
            )}

            {/* Article body — render HTML directly for rich-text posts, or convert from markdown */}
            <div
              className="article-body"
              style={s.articleBody}
              dangerouslySetInnerHTML={{
                __html: /<[a-z][\s\S]*>/i.test(post.content || '')
                  ? post.content
                  : renderMarkdown(post.content || ''),
              }}
            />

            {/* CTA section */}
            <BlogCTA />
          </article>

          {/* Footer */}
          <footer style={s.footer}>
            <Link to="/blog" style={s.backBtn}>← Back to all articles</Link>
            <p style={{ margin: '16px 0 0', color: '#94a3b8', fontSize: 13 }}>
              © {new Date().getFullYear()} CA Rahul Gupta Office &bull; All rights reserved
            </p>
          </footer>
        </div>
      )}
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
    maxWidth: 820,
    margin: '0 auto',
    padding: '0 24px',
    height: 58,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLogo: {
    fontSize: 17,
    fontWeight: 800,
    color: '#0f172a',
    textDecoration: 'none',
    letterSpacing: '-0.02em',
  },
  navLogoAccent: { color: '#F37920' },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  navLink: {
    fontSize: 13,
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

  // Loading / not found state
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '100px 24px',
    textAlign: 'center',
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #e2e8f0',
    borderTopColor: '#F37920',
    borderRadius: '50%',
    animation: 'blog-spin 0.8s linear infinite',
  },

  // Container
  container: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '28px 24px 60px',
  },

  // Breadcrumb
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
    fontSize: 13,
  },
  breadLink: {
    color: '#F37920',
    textDecoration: 'none',
    fontWeight: 500,
  },
  breadSep: { color: '#cbd5e1' },
  breadCurrent: {
    color: '#64748b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 300,
  },

  // Article
  article: {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    padding: '40px 48px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  articleMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  catBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 12px',
    borderRadius: 99,
  },
  articleDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  articleTitle: {
    margin: '0 0 16px',
    fontSize: 32,
    fontWeight: 900,
    color: '#0f172a',
    lineHeight: 1.2,
    letterSpacing: '-0.03em',
  },
  articleExcerpt: {
    margin: '0 0 24px',
    fontSize: 17,
    color: '#475569',
    lineHeight: 1.65,
    borderLeft: '3px solid #F37920',
    paddingLeft: 16,
    fontStyle: 'italic',
  },
  authorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
    paddingBottom: 28,
    borderBottom: '1px solid #f1f5f9',
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  authorName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0f172a',
  },
  authorRole: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  coverImg: {
    width: '100%',
    borderRadius: 10,
    marginBottom: 32,
    objectFit: 'cover',
    maxHeight: 380,
    display: 'block',
  },
  articleBody: {
    marginBottom: 8,
    textAlign: 'justify',
  },

  // Footer
  footer: {
    textAlign: 'center',
    marginTop: 40,
    paddingTop: 24,
    borderTop: '1px solid #e2e8f0',
  },
  backBtn: {
    display: 'inline-block',
    fontSize: 13,
    fontWeight: 600,
    color: '#475569',
    textDecoration: 'none',
    padding: '8px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    background: '#fff',
  },
};
