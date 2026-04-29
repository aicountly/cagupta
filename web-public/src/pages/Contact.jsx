import { useState } from 'react';
import { Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Container from '../components/ui/Container.jsx';
import { SITE } from '../config/site.config.js';

const SERVICE_OPTIONS = [
  'Income tax & ITR',
  'GST compliance',
  'Audit & assurance',
  'ROC / MCA compliance',
  'Bookkeeping & accounting',
  'Business / tax advisory',
  'Other',
];

export default function Contact() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    service: SERVICE_OPTIONS[0],
    message: '',
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const subject = `Enquiry from ${form.name || 'website'} – ${form.service}`;
    const body = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `Phone: ${form.phone}`,
      `Service: ${form.service}`,
      '',
      form.message,
    ].join('\n');
    window.location.href = `mailto:${SITE.contact.email}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <>
      <header className="page-header">
        <Container>
          <p className="page-header__crumbs">
            Home <span aria-hidden> · </span> Contact
          </p>
          <h1 className="page-header__title">Let's talk</h1>
          <p className="page-header__subtitle">
            Tell us a bit about what you need help with, and we will get back to
            you within one business day with next steps.
          </p>
        </Container>
      </header>

      <section className="section">
        <Container>
          <div className="contact-grid">
            <div>
              <div className="contact-info-card">
                <div className="contact-info-row">
                  <div className="contact-info-row__icon">
                    <Phone size={18} />
                  </div>
                  <div>
                    <strong>Phone</strong>
                    <a href={`tel:${SITE.contact.phone.replace(/\s/g, '')}`}>
                      {SITE.contact.phone}
                    </a>
                  </div>
                </div>
                <div className="contact-info-row">
                  <div className="contact-info-row__icon">
                    <Mail size={18} />
                  </div>
                  <div>
                    <strong>Email</strong>
                    <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a>
                  </div>
                </div>
                <div className="contact-info-row">
                  <div className="contact-info-row__icon">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <strong>Office address</strong>
                    <span>{SITE.contact.addressLine1}</span>
                    <span>{SITE.contact.addressLine2}</span>
                  </div>
                </div>
                <div className="contact-info-row">
                  <div className="contact-info-row__icon">
                    <Clock size={18} />
                  </div>
                  <div>
                    <strong>Working hours</strong>
                    <span>{SITE.contact.workingHours}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 18,
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  border: '1px solid var(--color-border-soft)',
                }}
              >
                <iframe
                  title="Office location"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(
                    `${SITE.contact.addressLine1} ${SITE.contact.addressLine2}`
                  )}&output=embed`}
                  width="100%"
                  height="240"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            <form className="contact-form" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="cf-name">Your name</label>
                <input
                  id="cf-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Full name"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label htmlFor="cf-email">Email</label>
                  <input
                    id="cf-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={update('email')}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="cf-phone">Phone</label>
                  <input
                    id="cf-phone"
                    type="tel"
                    value={form.phone}
                    onChange={update('phone')}
                    placeholder="+91 9XXXXXXXXX"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="cf-service">What can we help with?</label>
                <select id="cf-service" value={form.service} onChange={update('service')}>
                  {SERVICE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cf-message">Your message</label>
                <textarea
                  id="cf-message"
                  required
                  value={form.message}
                  onChange={update('message')}
                  placeholder="Briefly describe your situation..."
                />
              </div>
              <Button type="submit" variant="primary" size="lg">
                <Send size={16} /> Send message
              </Button>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-soft)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                Submitting will open your email client with the message pre-filled.
                Prefer to call? Use the number above.
              </p>
            </form>
          </div>
        </Container>
      </section>
    </>
  );
}
