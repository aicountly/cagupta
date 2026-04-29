import { useState } from 'react';
import { X, Pin, Lock, Eye, Users } from 'lucide-react';
import { createServiceLog } from '../../services/serviceLogService';

const LOG_TYPES = [
  { value: 'note',             label: 'Progress Note',        hint: 'General update on what is happening' },
  { value: 'follow_up',        label: 'Follow-up',            hint: 'Track a pending action with a due date' },
  { value: 'document_request', label: 'Document Request',     hint: 'Request documents from the client' },
  { value: 'internal_message', label: 'Internal Message',     hint: 'Staff-only message, never visible to clients' },
  { value: 'reminder',         label: 'Reminder Notice',      hint: 'Reminder sent to client or affiliate' },
];

const VISIBILITY_OPTIONS = [
  { value: 'internal',  label: 'Internal',  icon: Lock,  desc: 'Staff only' },
  { value: 'affiliate', label: 'Affiliate', icon: Users, desc: 'Staff + affiliates' },
  { value: 'client',    label: 'Client',    icon: Eye,   desc: 'Everyone including client portal' },
];

export default function AddLogModal({ serviceId, onClose, onCreated }) {
  const [logType, setLogType]         = useState('note');
  const [message, setMessage]         = useState('');
  const [visibility, setVisibility]   = useState('internal');
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const isInternalMessage = logType === 'internal_message';
  const isDocRequest      = logType === 'document_request';
  const isReminder        = logType === 'reminder';
  const needsFollowUp     = logType === 'follow_up';

  // Enforce visibility rules when type changes
  function handleTypeChange(t) {
    setLogType(t);
    if (t === 'internal_message') {
      setVisibility('internal');
    } else if (t === 'document_request' || t === 'reminder') {
      setVisibility('client');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) { setError('Message is required.'); return; }
    if (needsFollowUp && !followUpDate) { setError('Follow-up date is required for follow-up entries.'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        log_type:   logType,
        message:    message.trim(),
        visibility: isInternalMessage ? 'internal' : visibility,
        ...(followUpDate ? { follow_up_date: followUpDate } : {}),
      };
      const created = await createServiceLog(serviceId, payload);
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add log entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        {/* Header */}
        <div style={modalHeader}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3B' }}>Add Activity Log Entry</div>
          <button type="button" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={modalBody}>
          {/* Log type */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>Entry Type</label>
            <div style={typeGrid}>
              {LOG_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTypeChange(t.value)}
                  style={{
                    ...typeBtn,
                    ...(logType === t.value ? typeBtnActive : {}),
                  }}
                  title={t.hint}
                >
                  {t.label}
                  {t.value === 'internal_message' && (
                    <Lock size={11} style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.7 }} />
                  )}
                </button>
              ))}
            </div>
            {LOG_TYPES.find((t) => t.value === logType)?.hint && (
              <div style={hintText}>{LOG_TYPES.find((t) => t.value === logType).hint}</div>
            )}
          </div>

          {/* Visibility */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>
              Visibility
              {isInternalMessage && (
                <span style={lockedBadge}><Lock size={10} style={{ marginRight: 3 }} /> Locked to Internal</span>
              )}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {VISIBILITY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const disabled = isInternalMessage;
                const active   = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && setVisibility(opt.value)}
                    style={{
                      ...visBtn,
                      ...(active ? visBtnActive : {}),
                      ...(disabled && !active ? visDisabled : {}),
                    }}
                  >
                    <Icon size={13} style={{ marginRight: 5 }} />
                    <span>
                      <strong style={{ display: 'block', fontSize: 12 }}>{opt.label}</strong>
                      <span style={{ fontSize: 10, opacity: 0.8 }}>{opt.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Follow-up date (required for follow_up, optional for others) */}
          {(needsFollowUp || (!isInternalMessage && !isDocRequest && !isReminder)) && (
            <div style={fieldGroup}>
              <label style={fieldLabel}>
                Follow-up Date
                {needsFollowUp && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
                {!needsFollowUp && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>(optional)</span>}
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                required={needsFollowUp}
                style={inputStyle}
              />
            </div>
          )}

          {/* Message */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>
              Message <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                logType === 'follow_up'         ? 'Describe what needs to be followed up on…'
                : logType === 'document_request' ? 'Specify the documents needed from the client…'
                : logType === 'internal_message' ? 'Type your internal message to staff…'
                : logType === 'reminder'         ? 'Reminder message for the client…'
                : 'Describe the current progress, action taken, or update…'
              }
              rows={5}
              required
              style={textarea}
            />
          </div>

          {error && <div style={errBox}>{error}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Saving…' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16,
};
const modal = {
  background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
  maxHeight: '90vh', overflow: 'hidden',
};
const modalHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '18px 22px 14px', borderBottom: '1px solid #E6E8F0',
};
const modalBody = { padding: '20px 22px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 };
const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#94a3b8', display: 'flex', padding: 4, borderRadius: 6,
};
const fieldGroup = { display: 'flex', flexDirection: 'column', gap: 6 };
const fieldLabel = {
  fontSize: 12, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em',
  display: 'flex', alignItems: 'center', gap: 6,
};
const typeGrid = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const typeBtn = {
  padding: '6px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  background: '#F6F7FB', color: '#475569', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  transition: 'all 0.12s',
};
const typeBtnActive = {
  background: '#FEF0E6', color: '#F37920',
  borderColor: 'rgba(243,121,32,0.4)',
};
const hintText = { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' };
const lockedBadge = {
  display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 600,
  background: '#F1F5F9', color: '#64748b', padding: '2px 8px',
  borderRadius: 6, marginLeft: 6, textTransform: 'none', letterSpacing: 0,
};
const visBtn = {
  flex: 1, padding: '8px 10px', border: '1px solid #E6E8F0', borderRadius: 8,
  background: '#F6F7FB', color: '#475569', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', display: 'flex', alignItems: 'center', textAlign: 'left',
  transition: 'all 0.12s',
};
const visBtnActive = {
  background: '#EFF6FF', color: '#1d4ed8',
  borderColor: 'rgba(29,78,216,0.35)',
};
const visDisabled = { opacity: 0.4, cursor: 'not-allowed' };
const inputStyle = {
  padding: '8px 12px', border: '1px solid #E6E8F0', borderRadius: 8,
  fontSize: 13, color: '#334155', outline: 'none', background: '#fff',
};
const textarea = {
  ...inputStyle,
  resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
  width: '100%', boxSizing: 'border-box',
};
const errBox = {
  background: '#FFF1F2', border: '1px solid #fecdd3', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, color: '#dc2626',
};
const btnPrimary = {
  padding: '9px 20px', background: '#F37920', color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  boxShadow: '0 2px 8px rgba(243,121,32,0.3)',
};
const btnSecondary = {
  padding: '9px 18px', background: '#F6F7FB', color: '#475569',
  border: '1px solid #E6E8F0', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
};
