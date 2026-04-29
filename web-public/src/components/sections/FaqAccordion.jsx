import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Container from '../ui/Container.jsx';
import { FAQS } from '../../content/faqs.js';

export default function FaqAccordion() {
  const [open, setOpen] = useState(0);

  return (
    <section className="section" id="faq">
      <Container>
        <p className="section__eyebrow">FAQ</p>
        <h2 className="section__title">Questions clients ask before signing on.</h2>
        <p className="section__subtitle">
          Did not find your question here? Drop us a note from the contact page —
          we usually reply within one business day.
        </p>

        <div className="faq-list">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            const panelId = `faq-panel-${i}`;
            return (
              <div className="faq-item" key={item.q}>
                <button
                  type="button"
                  className="faq-item__btn"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={18} className="faq-item__chev" />
                </button>
                {isOpen && (
                  <div className="faq-item__panel" id={panelId} role="region">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
