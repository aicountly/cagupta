import { ArrowRight } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Container from '../ui/Container.jsx';
import { PORTAL_LINKS } from '../../config/site.config.js';

export default function CtaBanner() {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <Container>
        <div className="cta-banner">
          <div>
            <h2>Ready to hand off the paperwork?</h2>
            <p>Book a free 20-minute consultation, or sign in to your portal if you are already a client.</p>
          </div>
          <div className="cta-banner__actions">
            <Button to="/contact" variant="primary" size="lg">
              Talk to us <ArrowRight size={16} />
            </Button>
            <Button href={PORTAL_LINKS.client} variant="onDark" size="lg">
              Client login
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
