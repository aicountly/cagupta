import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container.jsx';
import { BLOG_POSTS } from '../content/blogPosts.js';
import useSeo from '../hooks/useSeo.js';

// In production both sites share the same origin, so /api is sufficient.
// For local dev set VITE_API_BASE_URL=http://localhost:8080/api in web-public/.env
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function normalizePost(p) {
  return {
    slug:      p.slug,
    title:     p.title,
    excerpt:   p.excerpt ?? p.body?.[0]?.text ?? '',
    date:      p.published_at ?? p.date ?? p.created_at,
    author:    p.author_name ?? p.author ?? 'CA Rahul Gupta',
    coverUrl:  p.cover_image_url ?? null,
    category:  p.category ?? null,
  };
}

export default function Blog() {
  useSeo({
    title: 'Blog | Tax, GST, Compliance & Finance Insights for Indian Businesses',
    description:
      'Practical articles on income tax, GST, audit, ROC compliance, MSME subsidies and AI for businesses — written by CA Rahul Gupta & Associates.',
  });

  const [posts, setPosts]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!API_BASE) {
      // No API configured — use static fallback
      setPosts([...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1)).map(normalizePost));
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/public/blogs`)
      .then(r => r.json())
      .then(json => {
        const items = Array.isArray(json.data) ? json.data : [];
        if (items.length > 0) {
          setPosts(items.map(normalizePost));
        } else {
          // API returned empty — show static fallback
          setPosts([...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1)).map(normalizePost));
        }
      })
      .catch(() => {
        // API unavailable — use static fallback
        setPosts([...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1)).map(normalizePost));
      })
      .finally(() => setLoading(false));
  }, []);

  const CATEGORY_LABELS = {
    laws:                 'Laws & Provisions',
    tax_saving:           'Tax Planning',
    ai_promotions:        'AI Promotions',
    subsidies_promotions: 'Subsidies',
    funding_promotions:   'Funding',
  };

  return (
    <>
      <header className="page-header">
        <Container>
          <p className="page-header__crumbs">
            Home <span aria-hidden> · </span> Blog
          </p>
          <h1 className="page-header__title">Insights & updates</h1>
          <p className="page-header__subtitle">
            Practical, no-jargon writeups on tax, GST, audits, and the everyday
            decisions that come up when you run a business in India.
          </p>
        </Container>
      </header>

      <section className="section">
        <Container>
          {loading ? (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading articles…</p>
          ) : !posts || posts.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>
              We are working on our first articles. Check back soon!
            </p>
          ) : (
            <div className="blog-grid">
              {posts.map((p) => (
                <article className="blog-card" key={p.slug}>
                  {p.coverUrl && (
                    <img
                      src={p.coverUrl}
                      alt={p.title}
                      style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }}
                    />
                  )}
                  <div className="blog-card__meta">
                    {formatDate(p.date)} · {p.author}
                    {p.category && CATEGORY_LABELS[p.category] && (
                      <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: p.category === 'laws' ? '#eff6ff' : '#fef3c7', color: p.category === 'laws' ? '#2563eb' : '#d97706' }}>
                        {CATEGORY_LABELS[p.category]}
                      </span>
                    )}
                  </div>
                  <h2 className="blog-card__title">{p.title}</h2>
                  <p className="blog-card__excerpt">{p.excerpt}</p>
                  <Link to={`/blog/${p.slug}`} className="blog-card__readmore">
                    Read article <ArrowRight size={14} />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
