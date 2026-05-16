import { Link } from 'react-router-dom';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import Container from '../ui/Container.jsx';
import { PORTAL_LINKS, SITE } from '../../config/site.config.js';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const since = SITE.copyrightSince;
  const copyrightYears =
    since === currentYear ? `${since}` : `${since}–${currentYear}`;
  return (
    <footer className="footer">
      <Container>
        <div className="footer__grid">
          <div className="footer__brand">
            <strong>{SITE.firmName}</strong>
            <p>
              Tax, audit, GST, ROC and advisory services for individuals,
              startups, and SMEs across India.
            </p>
          </div>

          <div className="footer__col">
            <h4>Explore</h4>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
            <Link to="/services">Services</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/contact">Contact</Link>
          </div>

          <div className="footer__col">
            <h4>Portals</h4>
            <a href={PORTAL_LINKS.client}>My CA</a>
            <a href={PORTAL_LINKS.affiliate}>Affiliate</a>
            <a href={PORTAL_LINKS.partner}>Partner</a>
            <a href={PORTAL_LINKS.staff}>Core</a>
          </div>

          <div className="footer__col">
            <h4>Reach us</h4>
            <div className="footer__reach">
              <div className="footer__contact-row">
                <Phone className="footer__contact-icon" size={14} aria-hidden />
                <a href={`tel:${SITE.contact.phone.replace(/\s/g, '')}`}>
                  {SITE.contact.phone}
                </a>
              </div>

              <div className="footer__contact-row">
                <Mail className="footer__contact-icon" size={14} aria-hidden />
                <div className="footer__contact-text">
                  <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a>
                  <a href={`mailto:${SITE.contact.email2}`}>{SITE.contact.email2}</a>
                </div>
              </div>

              <div className="footer__contact-row">
                <MapPin className="footer__contact-icon" size={14} aria-hidden />
                <div className="footer__contact-text">
                  <span>{SITE.contact.addressLine1}</span>
                  <span>{SITE.contact.addressLine2}</span>
                  <span className="footer__contact-note">
                    Also in: {SITE.contact.otherOffices.join(' · ')}
                  </span>
                </div>
              </div>

              <div className="footer__contact-row">
                <Clock className="footer__contact-icon" size={14} aria-hidden />
                <span>{SITE.contact.workingHours}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {copyrightYears} {SITE.firmName}. All rights reserved.</span>
          <span>{SITE.domain}</span>
        </div>
      </Container>
    </footer>
  );
}
