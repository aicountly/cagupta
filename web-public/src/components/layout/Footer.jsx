import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import Container from '../ui/Container.jsx';
import { PORTAL_LINKS, SITE } from '../../config/site.config.js';

export default function Footer() {
  const year = new Date().getFullYear();
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
            <a href={PORTAL_LINKS.staff}>Staff & Team</a>
            <a href={PORTAL_LINKS.affiliate}>Affiliate Partner</a>
            <a href={PORTAL_LINKS.client}>My CA (Client)</a>
          </div>

          <div className="footer__col">
            <h4>Reach us</h4>
            <a href={`tel:${SITE.contact.phone.replace(/\s/g, '')}`}>
              <Phone size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              {SITE.contact.phone}
            </a>
            <a href={`mailto:${SITE.contact.email}`}>
              <Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              {SITE.contact.email}
            </a>
            <span>
              <MapPin size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              {SITE.contact.addressLine1}
            </span>
            <span style={{ paddingLeft: 22 }}>{SITE.contact.addressLine2}</span>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {year} {SITE.firmName}. All rights reserved.</span>
          <span>{SITE.domain}</span>
        </div>
      </Container>
    </footer>
  );
}
