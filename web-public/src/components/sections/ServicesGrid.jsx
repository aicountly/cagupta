import {
  ArrowRight,
  BookOpen,
  Building2,
  FileText,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Container from '../ui/Container.jsx';
import { SERVICES } from '../../content/services.js';

const ICONS = {
  FileText,
  Receipt,
  ShieldCheck,
  Building2,
  BookOpen,
  TrendingUp,
};

export default function ServicesGrid() {
  return (
    <section className="section section--muted" id="services">
      <Container>
        <p className="section__eyebrow">What we do</p>
        <h2 className="section__title">Services that cover your full compliance lifecycle.</h2>
        <p className="section__subtitle">
          From a one-time return to a full retainer, we handle the entire spectrum of finance,
          tax, and regulatory work — so you can focus on running your business.
        </p>

        <div className="services-grid">
          {SERVICES.map((s) => {
            const Icon = ICONS[s.icon] || FileText;
            return (
              <article className="service-card" key={s.slug}>
                <div className="service-card__icon">
                  <Icon size={22} />
                </div>
                <h3 className="service-card__title">{s.title}</h3>
                <p className="service-card__body">{s.short}</p>
              </article>
            );
          })}
        </div>

        <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center' }}>
          <Link
            to="/services"
            style={{
              color: 'var(--color-orange)',
              fontWeight: 700,
              fontSize: 15,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            See full service details <ArrowRight size={16} />
          </Link>
        </div>
      </Container>
    </section>
  );
}
