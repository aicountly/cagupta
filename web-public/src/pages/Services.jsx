import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  FileText,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Container from '../components/ui/Container.jsx';
import { SERVICES } from '../content/services.js';

const ICONS = {
  FileText,
  Receipt,
  ShieldCheck,
  Building2,
  BookOpen,
  TrendingUp,
};

export default function Services() {
  return (
    <>
      <header className="page-header">
        <Container>
          <p className="page-header__crumbs">
            Home <span aria-hidden> · </span> Services
          </p>
          <h1 className="page-header__title">Services we offer</h1>
          <p className="page-header__subtitle">
            Whether it is a one-time return or a full retainer, here is the complete
            scope of work we handle for our clients.
          </p>
        </Container>
      </header>

      <section className="section">
        <Container>
          <div className="services-detail-list">
            {SERVICES.map((s) => {
              const Icon = ICONS[s.icon] || FileText;
              return (
                <article className="service-detail" key={s.slug} id={s.slug}>
                  <div className="service-detail__icon">
                    <Icon size={28} />
                  </div>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.short}</p>
                    <ul>
                      {s.bullets.map((b) => (
                        <li key={b}>
                          <Check
                            size={14}
                            style={{
                              display: 'inline',
                              marginRight: 6,
                              verticalAlign: '-2px',
                              color: 'var(--color-orange)',
                            }}
                          />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 56,
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <Button to="/contact" variant="primary" size="lg">
              Get a custom proposal <ArrowRight size={16} />
            </Button>
            <Button to="/about" variant="secondary" size="lg">
              Learn about the firm
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
