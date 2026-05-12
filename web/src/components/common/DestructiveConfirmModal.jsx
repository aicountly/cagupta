/**
 * Acknowledgement + confirm for deletes and other sensitive irreversible actions.
 */

export default function DestructiveConfirmModal({
  open,
  title,
  titleAccent = '#b91c1c',
  /** danger (red) | warning (amber) | neutral (blue) — confirm button hue */
  tone = 'danger',
  children,
  error,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onClose,
  onConfirm,
  busy = false,
  confirmDisabled = false,
  maxWidth = 440,
  zIndex = 10060,
  /** Validation / policy block: informational only — single Close button */
  blocked = false,
}) {
  if (!open) return null;

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.35)',
    zIndex,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };

  const confirmBg =
    tone === 'warning'
      ? '#d97706'
      : tone === 'neutral'
        ? '#2563eb'
        : '#b91c1c';

  return (
    <div
      role="presentation"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="destructive-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          width: '100%',
          maxWidth,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span id="destructive-modal-title" style={{ fontSize: 15, fontWeight: 700, color: titleAccent }}>
            {title}
          </span>
          <button type="button" onClick={() => !busy && onClose()} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={{ padding: '18px 22px', fontSize: 13, color: '#334155', lineHeight: 1.55 }}>
          {children}
          {error && (
            <div style={{ marginTop: 12, color: '#dc2626', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px' }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ padding: '12px 22px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {!blocked ? (
            <>
              <button type="button" onClick={() => !busy && onClose()} style={cancelBtnStyle} disabled={busy}>
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => !busy && onConfirm()}
                disabled={busy || confirmDisabled}
                style={{
                  padding: '8px 16px',
                  background: busy || confirmDisabled ? '#cbd5e1' : confirmBg,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: busy || confirmDisabled ? 'default' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {busy ? 'Working…' : confirmLabel}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => !busy && onClose()} style={{ ...cancelBtnStyle, padding: '8px 20px', background: '#2563eb', color: '#fff', borderColor: 'transparent', fontWeight: 600 }}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const closeBtn = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  cursor: 'pointer',
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
};
const cancelBtnStyle = {
  padding: '8px 14px',
  background: '#f8fafc',
  color: '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
