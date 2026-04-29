import { Award, GraduationCap, Mail, MapPin, Phone, ScrollText } from 'lucide-react';
import Container from '../components/ui/Container.jsx';
import { SITE } from '../config/site.config.js';

export default function About() {
  return (
    <>
      <header className="page-header">
        <Container>
          <p className="page-header__crumbs">
            Home <span aria-hidden> · </span> About
          </p>
          <h1 className="page-header__title">About {SITE.firmShort}</h1>
          <p className="page-header__subtitle">
            A modern Chartered Accountancy practice built around one simple promise:
            do the work well, on time, and explain it in plain English.
          </p>
        </Container>
      </header>

      <section className="section">
        <Container>
          <div className="about-grid">
            <aside className="about-card">
              <h3>{SITE.firmShort}</h3>
              <p className="about-card__role">Chartered Accountant · Practising</p>

              <div className="about-card__row">
                <GraduationCap size={18} />
                <div>
                  <strong>Member, ICAI</strong>
                  <span>Institute of Chartered Accountants of India</span>
                </div>
              </div>
              <div className="about-card__row">
                <Award size={18} />
                <div>
                  <strong>Areas of practice</strong>
                  <span>Tax, audit, GST, ROC, advisory</span>
                </div>
              </div>
              <div className="about-card__row">
                <Phone size={18} />
                <div>
                  <strong>Office</strong>
                  <span>{SITE.contact.phone}</span>
                </div>
              </div>
              <div className="about-card__row">
                <Mail size={18} />
                <div>
                  <strong>Email</strong>
                  <span>{SITE.contact.email}</span>
                </div>
              </div>
              <div className="about-card__row">
                <MapPin size={18} />
                <div>
                  <strong>{SITE.contact.addressLine1}</strong>
                  <span>{SITE.contact.addressLine2}</span>
                </div>
              </div>
            </aside>

            <div className="about-prose">
              <p>
                {/* TODO: replace with final bio */}
                {SITE.firmShort} is a Chartered Accountancy practice serving individuals,
                startups, and small-to-mid-sized businesses across India. The firm was
                founded with the goal of running a CA practice the way modern clients
                actually want to work with one — software-first, deadline-led, and
                completely transparent on scope and fees.
              </p>
              <p>
                Over the years, our team has filed thousands of returns, completed
                statutory and tax audits across diverse industries, and supported clients
                through scrutiny notices, ROC litigation, and cross-border structuring.
                We bring that depth into every engagement, no matter how small.
              </p>

              <h3>What you can expect</h3>
              <ul>
                <li>A single relationship manager from day one — not a different person every quarter.</li>
                <li>A written scope, fee, and timeline before we begin work.</li>
                <li>Documents and invoices managed through our secure client portal.</li>
                <li>Plain-English advice you can actually act on.</li>
                <li>Proactive deadline tracking so you never get a last-minute surprise.</li>
              </ul>

              <h3>Industries we serve</h3>
              <ul>
                <li>Technology and SaaS startups</li>
                <li>Manufacturing and trading businesses</li>
                <li>Professional services and consulting firms</li>
                <li>NRIs and individuals with cross-border income</li>
                <li>Salaried professionals and senior executives</li>
              </ul>

              <h3>Our credentials</h3>
              <ul>
                <li>
                  <ScrollText size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                  Member, Institute of Chartered Accountants of India (ICAI)
                </li>
                <li>Empanelled for statutory and internal audits</li>
                <li>Registered TRP and GST practitioner</li>
                {/* TODO: add additional credentials, certifications, awards */}
              </ul>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
