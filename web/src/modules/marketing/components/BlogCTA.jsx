/**
 * BlogCTA.jsx
 *
 * Call-to-action section displayed at the bottom of every public blog post
 * (and optionally the blog listing page).
 *
 * Clicking the button opens a modal lead-capture form.
 * In mock mode (no VITE_API_BASE_URL set in dev), the form simulates success
 * without hitting the backend.
 */

import { useState } from 'react';
import { submitPublicLead } from '../../../services/publicLeadService';
import { trackBlogCTAClick, trackBlogLeadSubmit } from '../../../utils/analytics';

const IS_MOCK = !import.meta.env.VITE_API_BASE_URL && import.meta.env.DEV;

const PREFILLED_MESSAGE =
  'Interested in AI implementation for my business. Please get in touch to discuss how AI can help automate and improve my workflows.';

export default function BlogCTA() {
  const [open, setOpen]       = useState(false);
  const [form, setForm]       = useState({ name: '', email: '', phone: '', message: PREFILLED_MESSAGE });
  const [submitting, setSub]  = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState('');

  function openModal() {
    setForm({ name: '', email: '', phone: '', message: PREFILLED_MESSAGE });
    setDone(false);
    setError('');
    setOpen(true);
    trackBlogCTAClick();
  }

  function closeModal() {
    if (submitting) return;
    setOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Please enter your name.'); return; }
    setError('');
    setSub(true);
    try {
      if (IS_MOCK) {
        await new Promise(r => setTimeout(r, 600));
      } else {
        await submitPublicLead({
          name:    form.name.trim(),
          email:   form.email.trim(),
          phone:   form.phone.trim(),
          message: form.message.trim(),
        });
      }
      setDone(true);
      trackBlogLeadSubmit();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSub(false);
    }
  }

  function set(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  return (
    <>
      {/* ── CTA Banner ──────────────────────────────────────────────────── */}
      <section style={styles.section}>
        <div style={styles.inner}>
          <div style={styles.badge}>AI for Business</div>
          <h2 style={styles.title}>Want to implement AI in your business?</h2>
          <p style={styles.body}>
            CA Rahul Gupta Office can help you identify automation opportunities,
            integrate AI into your business processes and build smarter workflows
            for growth, reporting and compliance.
          </p>
          <button onClick={openModal} style={styles.ctaBtn}>
            Contact us today to discuss AI implementation for your business
            <span style={{ marginLeft: 8 }}>→</span>
          </button>
        </div>
      </section>

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {open && (
        <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="cta-modal-title">

            {/* Header */}
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalBadge}>AI Implementation Enquiry</div>
                <h3 id="cta-modal-title" style={styles.modalTitle}>Get in touch with us</h3>
              </div>
              <button onClick={closeModal} style={styles.closeBtn} aria-label="Close">✕</button>
            </div>

            {done ? (
              /* ── Success state ──────────────────────────────────────── */
              <div style={styles.successBox}>
                <div style={styles.successIcon}>✓</div>
                <h4 style={styles.successTitle}>Thank you, {form.name.split(' ')[0]}!</h4>
                <p style={styles.successBody}>
                  We've received your enquiry and will get back to you shortly to
                  discuss how AI can transform your business.
                </p>
                <button onClick={closeModal} style={styles.doneBtn}>Close</button>
              </div>
            ) : (
              /* ── Form ───────────────────────────────────────────────── */
              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.fieldGrid}>
                  <div style={styles.fieldFull}>
                    <label style={styles.label}>
                      Full Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={set('name')}
                      placeholder="Your full name"
                      required
                      style={styles.input}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Email address</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="you@example.com"
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Phone number</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={set('phone')}
                      placeholder="+91 98765 43210"
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.fieldFull}>
                    <label style={styles.label}>Message</label>
                    <textarea
                      value={form.message}
                      onChange={set('message')}
                      rows={3}
                      style={{ ...styles.input, resize: 'vertical', minHeight: 80 }}
                    />
                  </div>
                </div>

                {error && <p style={styles.errorText}>{error}</p>}

                <div style={styles.modalFooter}>
                  <button type="button" onClick={closeModal} style={styles.cancelBtn} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="submit" style={styles.submitBtn} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Send Enquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  section: {
    background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 60%, #F37920 100%)',
    borderRadius: 16,
    margin: '48px 0 0',
    padding: '48px 40px',
    textAlign: 'center',
  },
  inner: {
    maxWidth: 680,
    margin: '0 auto',
  },
  badge: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    padding: '4px 14px',
    borderRadius: 99,
    marginBottom: 18,
    border: '1px solid rgba(255,255,255,0.25)',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 800,
    margin: '0 0 16px',
    lineHeight: 1.25,
    letterSpacing: '-0.02em',
  },
  body: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 1.7,
    margin: '0 0 28px',
  },
  ctaBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#fff',
    color: '#1e3a5f',
    border: 'none',
    borderRadius: 10,
    padding: '14px 28px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },

  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.6)',
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 540,
    boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 24px 16px',
    background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%)',
  },
  modalBadge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 6,
  },
  modalTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff',
    borderRadius: 8,
    width: 34,
    height: 34,
    cursor: 'pointer',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  form: {
    padding: '20px 24px 24px',
  },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
  },
  fieldFull: {
    gridColumn: '1 / -1',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#475569',
    marginBottom: 5,
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fff',
    transition: 'border-color 0.15s',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    margin: '10px 0 0',
    background: '#fef2f2',
    padding: '8px 12px',
    borderRadius: 6,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    padding: '9px 18px',
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  submitBtn: {
    padding: '9px 22px',
    background: '#F37920',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },

  // Success state
  successBox: {
    padding: '40px 24px',
    textAlign: 'center',
  },
  successIcon: {
    width: 56,
    height: 56,
    background: 'linear-gradient(135deg, #10b981, #059669)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    fontSize: 24,
    color: '#fff',
    fontWeight: 700,
  },
  successTitle: {
    margin: '0 0 10px',
    fontSize: 20,
    fontWeight: 800,
    color: '#0f172a',
  },
  successBody: {
    margin: '0 0 24px',
    fontSize: 14,
    color: '#64748b',
    lineHeight: 1.6,
    maxWidth: 380,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  doneBtn: {
    padding: '10px 28px',
    background: '#F37920',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
};
