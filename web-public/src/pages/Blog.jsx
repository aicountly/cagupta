import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container.jsx';
import { BLOG_POSTS } from '../content/blogPosts.js';

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

export default function Blog() {
  const posts = [...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));

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
          {posts.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>
              We are working on our first articles. Check back soon!
            </p>
          ) : (
            <div className="blog-grid">
              {posts.map((p) => (
                <article className="blog-card" key={p.slug}>
                  <div className="blog-card__meta">
                    {formatDate(p.date)} · {p.author}
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
