import Button from '../components/ui/Button.jsx';
import Container from '../components/ui/Container.jsx';

export default function NotFound() {
  return (
    <Container>
      <div style={{ padding: '120px 0', textAlign: 'center' }}>
        <p
          style={{
            color: 'var(--color-orange)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 12,
            margin: 0,
          }}
        >
          404
        </p>
        <h1
          style={{
            color: 'var(--color-navy)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 800,
            margin: '12px 0',
          }}
        >
          We could not find that page
        </h1>
        <p style={{ color: 'var(--color-text-muted)', margin: '0 0 28px' }}>
          The link may be outdated, or the page may have been moved.
        </p>
        <div
          style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <Button to="/" variant="primary">Go to home</Button>
          <Button to="/contact" variant="secondary">Contact us</Button>
        </div>
      </div>
    </Container>
  );
}
