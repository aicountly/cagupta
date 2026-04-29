import { ArrowRight, Calculator, ShieldCheck } from 'lucide-react';
import Container from '../ui/Container.jsx';
import Button from '../ui/Button.jsx';
import { SITE } from '../../config/site.config.js';

export default function Hero() {
  return (
    <section className="hero">
      <Container>
        <div className="hero__grid">
          <div>
            <span className="hero__eyebrow">Chartered Accountancy practice</span>
            <h1 className="hero__title">
              {SITE.heroTitle.split('&').map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>
                    {part}
                    <em>&amp;</em>
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </h1>
            <p className="hero__subtitle">{SITE.heroSubtitle}</p>
            <div className="hero__ctas">
              <Button to="/contact" variant="primary" size="lg">
                Book a free consultation <ArrowRight size={16} />
              </Button>
              <Button to="/services" variant="secondary" size="lg">
                Explore services
              </Button>
            </div>

            <div className="hero__stats">
              {SITE.stats.map((s) => (
                <div className="hero__stat" key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero__visual" aria-hidden="true">
            <div className="hero__badge">
              <span className="hero__badge-dot">
                <ShieldCheck size={22} />
              </span>
              <div>
                <strong>ICAI member firm</strong>
                <span>Practising Chartered Accountants, India</span>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                top: 28,
                left: 28,
                right: 28,
                color: 'rgba(255,255,255,0.92)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              <Calculator size={18} /> Tax · Audit · GST · ROC · Advisory
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
