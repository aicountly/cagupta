import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import Container from '../components/ui/Container.jsx';
import { BLOG_POSTS } from '../content/blogPosts.js';

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

export default function BlogPost() {
  const { slug } = useParams();
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return (
      <Container>
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <h1 style={{ color: 'var(--color-navy)' }}>Article not found</h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '12px 0 24px' }}>
            The article you are looking for may have been moved or removed.
          </p>
          <Link to="/blog" className="blog-post__back">
            <ArrowLeft
              size={14}
              style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }}
            />
            Back to all articles
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <article className="blog-post">
      <Link to="/blog" className="blog-post__back">
        <ArrowLeft
          size={14}
          style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }}
        />
        Back to all articles
      </Link>
      <h1>{post.title}</h1>
      <div className="blog-post__meta">
        {formatDate(post.date)} · {post.author}
      </div>
      <div className="blog-post__body">
        {post.body.map((block, i) => {
          if (block.type === 'h2') return <h2 key={i}>{block.text}</h2>;
          return <p key={i}>{block.text}</p>;
        })}
      </div>
    </article>
  );
}
