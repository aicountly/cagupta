import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import Container from '../components/ui/Container.jsx';
import { BLOG_POSTS } from '../content/blogPosts.js';

// In production both sites share the same origin, so /api is sufficient.
// For local dev set VITE_API_BASE_URL=http://localhost:8080/api in web-public/.env
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** True when content was saved as HTML (new rich-text posts). */
function isHtml(str) {
  return typeof str === 'string' && /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Converts markdown text to an HTML string.
 * Handles: # h1, ## h2, ### h3, **bold**, *italic*, [link](url),
 *          unordered lists (- or *), numbered lists, paragraphs.
 * Also fixes legacy literal "\n" sequences from the old AI prompt.
 */
function renderMarkdown(md) {
  if (!md) return '';
  // Fix literal "\n" (two-char backslash+n) → real newlines
  let fixed = md.replace(/\\n/g, '\n');
  const lines = fixed.split('\n');
  const out = [];
  let listBuf = [];
  let orderedBuf = [];

  function flushList() {
    if (listBuf.length) {
      out.push(`<ul>${listBuf.map(item => `<li>${item}</li>`).join('')}</ul>`);
      listBuf = [];
    }
    if (orderedBuf.length) {
      out.push(`<ol>${orderedBuf.map(item => `<li>${item}</li>`).join('')}</ol>`);
      orderedBuf = [];
    }
  }

  function inlineFormat(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) {
      flushList();
      out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      flushList();
      out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
    } else if (/^[-*] /.test(line)) {
      orderedBuf.length && flushList();
      listBuf.push(inlineFormat(line.slice(2)));
    } else if (/^\d+\. /.test(line)) {
      listBuf.length && flushList();
      orderedBuf.push(inlineFormat(line.replace(/^\d+\. /, '')));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  flushList();
  return out.join('\n');
}

/**
 * Render blog content that may come from either:
 *  - Static format: post.body array of { type, text } objects
 *  - API format:    post.content plain-text with markdown formatting
 */
function BlogContent({ post }) {
  // API-sourced post has a `content` string — render HTML directly or convert from markdown
  if (typeof post.content === 'string') {
    // Fix legacy literal "\n" sequences before any check
    const cleaned = post.content.replace(/\\n/g, '\n');
    const html = isHtml(cleaned) ? cleaned : renderMarkdown(cleaned);
    return (
      <div
        className="blog-post__body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Static format: body array
  if (Array.isArray(post.body)) {
    return (
      <div className="blog-post__body">
        {post.body.map((block, i) => {
          if (block.type === 'h2') return <h2 key={i}>{block.text}</h2>;
          return <p key={i}>{block.text}</p>;
        })}
      </div>
    );
  }

  return null;
}

function NotFound() {
  return (
    <Container>
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--color-navy)' }}>Article not found</h1>
        <p style={{ color: 'var(--color-text-muted)', margin: '12px 0 24px' }}>
          The article you are looking for may have been moved or removed.
        </p>
        <Link to="/blog" className="blog-post__back">
          <ArrowLeft size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
          Back to all articles
        </Link>
      </div>
    </Container>
  );
}

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Inject OG / Twitter meta tags into <head> once post data is loaded.
  // Covers browsers' native share sheets and in-app browsers that execute JS.
  // WhatsApp's link-preview bot (no JS) is handled server-side via prerender.php.
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
      const key  = attrs.property ?? attrs.name;
      const attr = attrs.property ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        document.head.appendChild(el);
        inserted.push(el);
      }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    });

    const prevTitle = document.title;
    document.title  = post.title || siteName;

    return () => {
      document.title = prevTitle;
      inserted.forEach(el => el.parentNode?.removeChild(el));
    };
  }, [post]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setPost(null);

    if (API_BASE) {
      fetch(`${API_BASE}/public/blogs/${encodeURIComponent(slug)}`)
        .then(r => {
          if (r.status === 404) throw new Error('not_found');
          return r.json();
        })
        .then(json => {
          const data = json.data;
          if (!data) throw new Error('not_found');
          // Normalise field names for BlogContent
          setPost({
            ...data,
            date:   data.published_at ?? data.created_at,
            author: data.author_name ?? 'CA Rahul Gupta',
          });
        })
        .catch(() => {
          // API 404 or network error — try static fallback before giving up
          const staticPost = BLOG_POSTS.find(p => p.slug === slug);
          if (staticPost) setPost(staticPost);
          else setNotFound(true);
        })
        .finally(() => setLoading(false));
    } else {
      // No API — use static data
      const staticPost = BLOG_POSTS.find(p => p.slug === slug);
      if (staticPost) setPost(staticPost);
      else setNotFound(true);
      setLoading(false);
    }
  }, [slug]);

  if (loading) {
    return (
      <Container>
        <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading article…
        </div>
      </Container>
    );
  }

  if (notFound || !post) {
    return <NotFound />;
  }

  const dateStr  = formatDate(post.published_at ?? post.date ?? post.created_at);
  const authorStr = post.author_name ?? post.author ?? 'CA Rahul Gupta';

  return (
    <article className="blog-post">
      <Link to="/blog" className="blog-post__back">
        <ArrowLeft size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
        Back to all articles
      </Link>

      {(post.cover_image_url) && (
        <img
          src={post.cover_image_url}
          alt={post.title}
          style={{ width: '100%', maxHeight: 380, objectFit: 'cover', borderRadius: 12, margin: '16px 0 24px' }}
        />
      )}

      <h1>{post.title}</h1>
      <div className="blog-post__meta">
        {dateStr} · {authorStr}
      </div>

      <BlogContent post={post} />
    </article>
  );
}
