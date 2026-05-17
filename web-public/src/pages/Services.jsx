import {
  ArrowRight,
  BookOpen,
  Brain,
  Building2,
  Check,
  Cpu,
  FileText,
  Monitor,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Container from '../components/ui/Container.jsx';
import CtaBanner from '../components/sections/CtaBanner.jsx';
import { SERVICES, ADVANCED_PRACTICE_AREAS } from '../content/services.js';
import useSeo from '../hooks/useSeo.js';

const SERVICE_ICONS = {
  FileText,
  Receipt,
  ShieldCheck,
  Building2,
  BookOpen,
  TrendingUp,
};

const AREA_ICONS = {
  ShieldCheck,
  Monitor,
  Brain,
  Cpu,
  TrendingUp,
  Building2,
};

export default function Services() {
  useSeo({
    title: 'CA Services | ITR Filing, GST, Audit, ROC Compliance & Advisory',
    description:
      'Complete range of CA services: income tax & ITR filing, GST compliance, statutory audit, ROC / MCA compliance, bookkeeping, and business advisory. Serving individuals, startups and SMEs across India.',
  });

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="svc-page-header">
        <Container>
          <p className="page-header__crumbs">
            <a href="/">Home</a>
            <span aria-hidden> · </span>
            Services
          </p>
          <div className="svc-page-header__inner">
            <div className="svc-page-header__copy">
              <div className="svc-page-header__eyebrow">
                <Sparkles size={13} />
                Full-spectrum CA practice
              </div>
              <h1 className="svc-page-header__title">Services we offer</h1>
              <p className="svc-page-header__subtitle">
                Whether it is a one-time return or a full retainer, here is the complete
                scope of work we handle for our clients — from routine compliance to
                specialised strategic mandates.
              </p>
              <div className="svc-page-header__ctas">
                <Button to="/contact" variant="primary">
                  Get a custom proposal <ArrowRight size={15} />
                </Button>
                <Button to="/about" variant="secondary">
                  About the firm
                </Button>
              </div>
            </div>
            <div className="svc-page-header__stats">
              <div className="svc-stat-chip">
                <strong>12+</strong>
                <span>Years of practice</span>
              </div>
              <div className="svc-stat-chip">
                <strong>500+</strong>
                <span>Clients served</span>
              </div>
              <div className="svc-stat-chip">
                <strong>6</strong>
                <span>Specialised areas</span>
              </div>
            </div>
          </div>
        </Container>
      </header>

      {/* ── Core CA Services ─────────────────────────────────────────────── */}
      <section className="section">
        <Container>
          <p className="section__eyebrow">Core compliance & advisory</p>
          <h2 className="section__title">Everything your business needs, under one roof</h2>
          <p className="section__subtitle">
            Accurate, timely, and transparent — our core CA services cover the full
            compliance lifecycle for individuals, startups, and established businesses.
          </p>

          <div className="svc-cards-grid">
            {SERVICES.map((s) => {
              const Icon = SERVICE_ICONS[s.icon] || FileText;
              return (
                <article className="svc-card" key={s.slug} id={s.slug}>
                  <div className="svc-card__icon">
                    <Icon size={24} />
                  </div>
                  <h3 className="svc-card__title">{s.title}</h3>
                  <p className="svc-card__body">{s.short}</p>
                  <ul className="svc-card__bullets">
                    {s.bullets.map((b) => (
                      <li key={b}>
                        <Check size={13} className="svc-check-icon" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </Container>
      </section>

      {/* ── Advanced Practice Areas ──────────────────────────────────────── */}
      <section className="section section--muted">
        <Container>
          <div className="svc-adv-header">
            <div>
              <p className="section__eyebrow">Specialised services</p>
              <h2 className="section__title">Advanced Practice Areas</h2>
              <p className="section__subtitle">
                Beyond core compliance, we operate across six high-value advisory
                domains — combining CA expertise with technology and strategic thinking.
              </p>
            </div>
          </div>

          <div className="svc-adv-grid">
            {ADVANCED_PRACTICE_AREAS.map((area) => {
              const Icon = AREA_ICONS[area.icon] || ShieldCheck;
              return (
                <article
                  key={area.id}
                  className="svc-adv-card"
                  style={{
                    '--area-color': area.color,
                    '--area-bg': area.bg,
                    '--area-border': area.border,
                  }}
                >
                  <div className="svc-adv-card__icon">
                    <Icon size={22} />
                  </div>
                  <div className="svc-adv-card__body">
                    <h3 className="svc-adv-card__title">{area.label}</h3>
                    <p className="svc-adv-card__tagline">{area.tagline}</p>
                    <ul className="svc-adv-card__bullets">
                      {area.bullets.map((b) => (
                        <li key={b}>
                          <Check size={12} className="svc-check-icon" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </Container>
      </section>

      {/* ── Beyond the checklist ─────────────────────────────────────────── */}
      <section className="section">
        <Container>
          <div className="svc-beyond">
            <div className="svc-beyond__copy">
              <p className="section__eyebrow">Beyond the checklist</p>
              <h2 className="svc-beyond__title">
                Where we operate as stewards — and problem solvers.
              </h2>
              <p className="svc-beyond__intro">
                Compliance is table stakes; we regularly step in upstream of filings —
                on incentives, investors, messy operations, and how technology can carry
                the load.
              </p>
              <ul className="svc-beyond__list">
                {[
                  'Government subsidies — mapping eligible schemes (central & state), documentation, timelines, reimbursement tracking, and clean books so benefits hold up to audit.',
                  'Investor funding — investment readiness: financial narrative, MIS, diligence rooms, valuations context, cap tables, and tax/FEMA-aware structuring conversations with founders.',
                  'Hands-on problem solving — unpacking stuck situations across tax, operations, and controls, assigning owners and turning ambiguity into executable next steps.',
                  'IT & custom applications — bridging business users and builders: documenting workflows, sizing a bespoke portal or automation, and supervising delivery so a custom app actually lifts throughput and lowers errors.',
                ].map((b) => (
                  <li key={b}>
                    <Check size={14} className="svc-check-icon svc-check-icon--lg" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="svc-beyond__visual">
              <div className="svc-beyond__badge">
                <Sparkles size={18} className="svc-beyond__sparkle" />
                <div>
                  <strong>Integrated advisory</strong>
                  <span>CA expertise meets technology</span>
                </div>
              </div>
              <div className="svc-beyond__pill-grid">
                {['Tax strategy', 'AI tooling', 'Investor readiness', 'Govt. schemes', 'IT delivery', 'MIS & controls'].map((tag) => (
                  <span key={tag} className="svc-beyond__pill">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <CtaBanner />
    </>
  );
}
