/**
 * Modal for duplicate (identical) or similar directory names (orgs / contacts).
 */
export default function NameCollisionModal({
  open,
  onClose,
  kind,
  entityNoun,
  matches,
  onOpenRecord,
}) {
  if (!open || !kind || !Array.isArray(matches) || matches.length === 0) return null;

  const isIdentical = kind === 'identical';
  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 16,
  };
  const panel = {
    background: '#fff',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 520,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-collision-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div id="name-collision-title" style={{ fontSize: 16, fontWeight: 700, color: isIdentical ? '#991b1b' : '#92400e' }}>
              {isIdentical ? `Duplicate ${entityNoun} name` : `Similar ${entityNoun} name(s)`}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              {isIdentical
                ? `Another ${entityNoun} already uses this exact name. Change the name before saving, or open the existing record.`
                : `Other ${entityNoun}s in the directory closely match this name (one contains the other). You may still save if they are genuinely different parties.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div
          style={{
            background: '#f8fafc',
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            border: '1px solid #e2e8f0',
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 10, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Existing record{matches.length > 1 ? 's' : ''}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#0f172a' }}>
            {matches.map((m) => (
              <li key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>ID {m.id}</div>
                <button
                  type="button"
                  onClick={() => onOpenRecord(m.id)}
                  style={{
                    marginTop: 6,
                    padding: '4px 12px',
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid #E6E8F0',
                    background: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: '#F37920',
                  }}
                >
                  Open this {entityNoun}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={modalBtnSecondary}>
            {isIdentical ? 'Close' : 'Close — I will save from the form if appropriate'}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalBtnSecondary = {
  padding: '8px 16px',
  background: '#f8fafc',
  color: '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
