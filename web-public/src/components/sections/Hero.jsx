import { ArrowRight, Building2, Calculator, FileText, Receipt, ShieldCheck } from 'lucide-react';
import Container from '../ui/Container.jsx';
import Button from '../ui/Button.jsx';
import { SITE } from '../../config/site.config.js';

const VISUAL_SERVICES = [
  { Icon: FileText,  title: 'Income Tax & ITR',  sub: 'Filing, planning & notice handling' },
  { Icon: Receipt,   title: 'GST Compliance',    sub: 'GSTR-1, 3B, 9, 9C & audits' },
  { Icon: Building2, title: 'ROC & Advisory',    sub: 'Incorporation & MCA filings' },
];

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
            {/* Top service strip */}
            <div className="hero__visual-strip">
              <Calculator size={18} /> Tax · Audit · GST · ROC · Advisory
            </div>

            {/* Middle: service cards + stats */}
            <div className="hero__visual-mid">
              {VISUAL_SERVICES.map(({ Icon, title, sub }, i) => (
                <div className="hero__svc-card" key={title} style={{ animationDelay: `${i * 1.4}s` }}>
                  <span className="hero__svc-icon"><Icon size={18} /></span>
                  <div>
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </div>
                </div>
              ))}

              <div className="hero__stat-strip">
                {SITE.stats.map((s) => (
                  <div className="hero__stat-chip" key={s.label}>
                    <strong>{s.value}</strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom: ICAI badge */}
            <div className="hero__badge">
              <span className="hero__badge-dot">
                <ShieldCheck size={22} />
              </span>
              <div>
                <strong>ICAI member firm</strong>
                <span>Practising Chartered Accountants, India</span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
