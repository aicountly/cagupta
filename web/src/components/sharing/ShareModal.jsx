/**
 * ShareModal — Universal document / content sharing modal.
 *
 * Props:
 *   open        {boolean}  — whether the modal is visible
 *   onClose     {function} — close callback
 *   documentId  {number}   — ID of the document to share (optional)
 *   documentName {string}  — display name for the document
 *   clientId    {number}   — pre-fill with this client (optional)
 *   clientName  {string}
 *   clientEmail {string}
 *   clientMobile {string}
 */
import { useState } from 'react';
import { X, Mail, Smartphone, MessageSquare, Send, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '../../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const CHANNELS = [
  {
    id: 'email',
    label: 'Email',
    icon: Mail,
    color: '#2563eb',
    bg: '#eff6ff',
    desc: 'Send via email with secure download link',
  },
  {
    id: 'sms',
    label: 'SMS',
    icon: Smartphone,
    color: '#7c3aed',
    bg: '#f5f3ff',
    desc: 'Send download link via SMS',
  },
  {
    id: 'wa_web',
    label: 'WA Web',
    icon: MessageSquare,
    color: '#16a34a',
    bg: '#f0fdf4',
    desc: 'Send via your connected WhatsApp session',
  },
  {
    id: 'wa_api',
    label: 'WA API',
    icon: MessageSquare,
    color: 'var(--portal-primary)',
    bg: 'var(--portal-primary-tint)',
    desc: 'Send via WhatsApp Business API',
  },
];

export default function ShareModal({
  open,
  onClose,
  documentId,
  documentName = 'Document',
  clientId,
  clientName = '',
  clientEmail = '',
  clientMobile = '',
}) {
  const [channel, setChannel] = useState('email');
  const [recipientName, setRecipientName] = useState(clientName);
  const [recipientEmail, setRecipientEmail] = useState(clientEmail);
  const [recipientMobile, setRecipientMobile] = useState(clientMobile);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  if (!open) return null;

  async function handleShare() {
    if (!documentId) return;
    const sel = CHANNELS.find((c) => c.id === channel);
    if ((channel === 'email' || channel === 'wa_api') && !recipientEmail && !recipientMobile) {
      setResult({ success: false, message: 'Please enter a recipient email or mobile.' });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/marketing/documents/${documentId}/share`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          channel,
          client_id: clientId || null,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          recipient_mobile: recipientMobile,
        }),
      });
      const data = await res.json();
      setResult({
        success: res.ok,
        message: res.ok
          ? `"${documentName}" shared via ${sel?.label || channel}!`
          : (data.message || 'Failed to share document.'),
        shareUrl: data.data?.share_url,
      });
    } catch {
      setResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  const selectedChannel = CHANNELS.find((c) => c.id === channel);

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalBox}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Share Document</h3>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{documentName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Channel selector */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Select sharing method
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {CHANNELS.map((ch) => {
              const Icon = ch.icon;
              const selected = channel === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setChannel(ch.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    border: selected ? `2px solid ${ch.color}` : '1px solid #e2e8f0',
                    background: selected ? ch.bg : '#f8fafc',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: selected ? ch.color : '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={14} color={selected ? '#fff' : '#64748b'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: selected ? ch.color : '#1e293b' }}>{ch.label}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.3 }}>{ch.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recipient fields */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recipient
          </div>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Full name (optional)"
            style={inputStyle}
          />
          {(channel === 'email' || channel === 'wa_api') && (
            <input
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              style={{ ...inputStyle, marginTop: 6 }}
            />
          )}
          {(channel === 'sms' || channel === 'wa_web' || channel === 'wa_api') && (
            <input
              value={recipientMobile}
              onChange={(e) => setRecipientMobile(e.target.value)}
              placeholder="Mobile number (e.g. 91XXXXXXXXXX)"
              style={{ ...inputStyle, marginTop: 6 }}
            />
          )}
        </div>

        {/* Result */}
        {result && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8,
            background: result.success ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${result.success ? '#bbf7d0' : '#fecaca'}`,
            color: result.success ? '#16a34a' : '#dc2626', fontSize: 13,
          }}>
            {result.success ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
            <div>
              <div>{result.message}</div>
              {result.shareUrl && (
                <a href={result.shareUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#16a34a', marginTop: 4 }}>
                  <ExternalLink size={11} /> View share link
                </a>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ ...btnOutline, flex: 1, justifyContent: 'center' }}>Cancel</button>
          <button
            onClick={handleShare}
            disabled={sending || !documentId}
            style={{ ...btnPrimary, flex: 2, justifyContent: 'center', opacity: (sending || !documentId) ? 0.7 : 1,
              background: selectedChannel?.color || 'var(--portal-primary)',
            }}
          >
            <Send size={13} />
            {sending ? 'Sharing…' : `Share via ${selectedChannel?.label || channel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
};
const modalBox = {
  background: '#fff', borderRadius: 16, padding: '24px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '100%', maxWidth: 480,
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnOutline = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#fff', color: '#334155', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc',
  boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};
