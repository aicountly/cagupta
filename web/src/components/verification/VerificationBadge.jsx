/**
 * VerificationBadge — Shows email/mobile verification status with verify button.
 *
 * Props:
 *   verified      {boolean}
 *   field         {'email'|'mobile'}
 *   value         {string}   — the email or mobile
 *   clientId      {number}
 *   onVerified    {function} — called after successful verification
 *   compact       {boolean}  — minimal display (icon only)
 */
import { useState } from 'react';
import { CheckCircle2, AlertCircle, ShieldCheck, X, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../../constants/config';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function VerificationBadge({ verified, field, value, clientId, onVerified, compact = false }) {
  const [showModal, setShowModal] = useState(false);

  if (!value) return null;

  const dot = verified ? (
    <span title={`${field} verified`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
      <CheckCircle2 size={11} /> {!compact && 'Verified'}
    </span>
  ) : (
    <button
      onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
      title={`${field} not verified — click to verify`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 11, color: '#d97706', fontWeight: 600,
        background: 'none', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 6px',
        cursor: 'pointer', lineHeight: 1.4,
      }}
    >
      <AlertCircle size={11} /> {!compact && 'Unverified'}
    </button>
  );

  return (
    <>
      {dot}
      {showModal && (
        <VerifyModal
          field={field}
          value={value}
          clientId={clientId}
          onClose={() => setShowModal(false)}
          onVerified={() => { setShowModal(false); onVerified?.(); }}
        />
      )}
    </>
  );
}

function VerifyModal({ field, value, clientId, onClose, onVerified }) {
  const [channel, setChannel] = useState(field === 'email' ? 'email' : 'sms');
  const [step, setStep] = useState('send'); // 'send' | 'otp'
  const [otp, setOtp] = useState('');
  const [masked, setMasked] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const availableChannels = field === 'email'
    ? [{ id: 'email', label: 'Email OTP' }]
    : [{ id: 'sms', label: 'SMS OTP' }, { id: 'whatsapp', label: 'WhatsApp OTP' }];

  async function handleSendOtp() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/contacts/${clientId}/verify/send-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ field, channel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send OTP');
      setMasked(data.data?.masked || value);
      setStep('otp');
      setResendTimer(60);
      const iv = setInterval(() => setResendTimer((t) => { if (t <= 1) { clearInterval(iv); return 0; } return t - 1; }), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (otp.length !== 6) { setError('Please enter the 6-digit OTP.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/contacts/${clientId}/verify/confirm`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ field, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Verification failed');
      onVerified();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color="var(--portal-primary)" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Verify {field === 'email' ? 'Email' : 'Mobile'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Verifying: <strong style={{ color: '#1e293b' }}>{value}</strong>
        </div>

        {step === 'send' ? (
          <>
            {availableChannels.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Send OTP via</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {availableChannels.map((ch) => (
                    <button key={ch.id} onClick={() => setChannel(ch.id)} style={{
                      flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                      border: channel === ch.id ? '2px solid var(--portal-primary)' : '1px solid #e2e8f0',
                      background: channel === ch.id ? 'var(--portal-primary-tint)' : '#f8fafc',
                      color: channel === ch.id ? 'var(--portal-primary)' : '#64748b',
                    }}>{ch.label}</button>
                  ))}
                </div>
              </div>
            )}
            {error && <div style={errorStyle}>{error}</div>}
            <button onClick={handleSendOtp} disabled={loading} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>
              {loading ? <><RefreshCw size={13} /> Sending…</> : `Send OTP via ${availableChannels.find((c) => c.id === channel)?.label}`}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
              OTP sent to <strong>{masked}</strong>. Enter the 6-digit code below.
            </div>
            <input
              type="text" inputMode="numeric" maxLength={6}
              value={otp} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
              placeholder="_ _ _ _ _ _"
              style={{ ...inputStyle, letterSpacing: 8, textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 10 }}
              autoFocus
            />
            {error && <div style={errorStyle}>{error}</div>}
            <button onClick={handleVerify} disabled={loading || otp.length !== 6}
              style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginBottom: 8, opacity: otp.length !== 6 ? 0.6 : 1 }}>
              {loading ? <><RefreshCw size={13} /> Verifying…</> : 'Verify OTP'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
              {resendTimer > 0 ? (
                <span>Resend OTP in {resendTimer}s</span>
              ) : (
                <button onClick={handleSendOtp} disabled={loading}
                  style={{ background: 'none', border: 'none', color: 'var(--portal-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  Resend OTP
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 };
const modalBox = { background: '#fff', borderRadius: 14, padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '100%', maxWidth: 380 };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--portal-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };
const errorStyle = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 10 };
