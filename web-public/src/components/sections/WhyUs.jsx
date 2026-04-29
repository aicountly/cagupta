import { Clock, HeartHandshake, Lock, MessageSquare, Sparkles, Workflow } from 'lucide-react';
import Container from '../ui/Container.jsx';

const REASONS = [
  {
    Icon: HeartHandshake,
    title: 'A relationship, not a transaction',
    body: 'You get a single relationship manager who knows your business — not a different person every quarter.',
  },
  {
    Icon: Workflow,
    title: 'Modern, software-led practice',
    body: 'Tasks, documents, invoices and reminders all live on a secure portal. No more chasing files over WhatsApp.',
  },
  {
    Icon: Clock,
    title: 'Deadlines we own, not chase',
    body: 'GST, TDS, ROC, ITR — every recurring filing is tracked internally so you never get a last-minute surprise.',
  },
  {
    Icon: Lock,
    title: 'Confidentiality by design',
    body: 'Documents are stored on an access-controlled portal with audit trails. Sensitive credentials never sit in email.',
  },
  {
    Icon: MessageSquare,
    title: 'Plain-English answers',
    body: 'We explain the why before the what. You get advice you can actually act on, not jargon you have to decode.',
  },
  {
    Icon: Sparkles,
    title: 'Boutique attention, full-service depth',
    body: 'Small enough to care, deep enough to handle audits, valuations, FEMA, and litigation when you need them.',
  },
];

export default function WhyUs() {
  return (
    <section className="section section--navy" id="why">
      <Container>
        <p className="section__eyebrow" style={{ color: '#FFB37A' }}>Why work with us</p>
        <h2 className="section__title">Practical, on-time, transparent.</h2>
        <p className="section__subtitle">
          We have intentionally built a practice where you always know who is doing what,
          when it is due, and what it will cost. Here is what that looks like in day-to-day.
        </p>

        <div className="why-grid">
          {REASONS.map(({ Icon, title, body }) => (
            <div className="why-item" key={title}>
              <span className="why-item__icon">
                <Icon size={20} />
              </span>
              <div>
                <h3 className="why-item__title">{title}</h3>
                <p className="why-item__body">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
