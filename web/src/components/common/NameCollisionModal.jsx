/**
 * Modal for duplicate / similar directory names (organizations) or
 * suspicious name duplicates vs identical PAN (contacts).
 *
 * @param {'org'|'contact_name_duplicate'|'contact_pan_identical'|null} [collisionProfile]
 *        When null, uses legacy `kind` identical/similar (organizations).
 */
export default function NameCollisionModal({
  open,
  onClose,
  kind,
  entityNoun,
  matches,
  onOpenRecord,
  /** When `'save'`, blocking duplicate was detected on save — show explicit “not saved” copy. */
  blockingReason = null,
  /**
   * Contact-specific UX; when set, overrides title/body/buttons vs org `kind`.
   * Organizations should omit this and pass kind identical | similar.
   */
  collisionProfile = null,
  /**
   * When set (e.g. contact suspicious duplicate after Save), shows a primary action to proceed.
   * Not used for identical PAN / org name block.
   */
  onConfirm = null,
  confirmLabel = 'Confirm',
  confirmBusy = false,
}) {
  if (!open || !Array.isArray(matches) || matches.length === 0) return null;

  const isOrgIdentical = !collisionProfile && kind === 'identical';
  const isContactNameDup = collisionProfile === 'contact_name_duplicate';
  const isContactPan = collisionProfile === 'contact_pan_identical';

  if (!collisionProfile && kind !== 'identical' && kind !== 'similar') return null;

  const isBlocking = isOrgIdentical || isContactPan;
  const titleColor = isBlocking ? '#991b1b' : '#92400e';

  let title = '';
  if (isContactPan) {
    title = 'Identical PAN';
  } else if (isContactNameDup) {
    title = `Suspicious duplicate ${entityNoun} name`;
  } else if (isOrgIdentical) {
    title = `Duplicate ${entityNoun} name`;
  } else {
    title = `Similar ${entityNoun} name(s)`;
  }

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

  function renderBody() {
    if (isContactPan && blockingReason === 'save') {
      return (
        <div style={{ margin: '10px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#991b1b' }}>Your changes were not saved.</p>
          <p style={{ margin: 0 }}>
            Another contact already uses this PAN. Change the PAN, or open the existing record below. Two different people may share the same name, but not the same PAN.
          </p>
        </div>
      );
    }
    if (isContactPan) {
      return (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
          Another contact already uses this PAN. Change the PAN before saving, or open the existing record.
        </p>
      );
    }
    if (isContactNameDup && blockingReason === 'save') {
      return (
        <div style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#92400e' }}>Your changes are not saved yet.</p>
          <p style={{ margin: '0 0 10px' }}>
            Other contacts have the same or a very similar name. This is a suspicious duplicate — not proof it is the same person. Review the records below.
          </p>
          {typeof onConfirm === 'function' ? (
            <p style={{ margin: 0 }}>
              If you have verified this is a different person, click <strong>{confirmLabel}</strong> below to save.
            </p>
          ) : null}
        </div>
      );
    }
    if (isContactNameDup) {
      return (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
          Other contacts have the same or a very similar name. This is a suspicious duplicate — not proof it is the same person. Review the records below; you can still save if they are different parties.
        </p>
      );
    }
    if (isOrgIdentical && blockingReason === 'save') {
      return (
        <div style={{ margin: '10px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#991b1b' }}>Your changes were not saved.</p>
          <p style={{ margin: 0 }}>
            {`Another ${entityNoun} already uses this exact name. Use a different name in the form, or open an existing record below.`}
          </p>
        </div>
      );
    }
    return (
      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
        {isOrgIdentical
          ? `Another ${entityNoun} already uses this exact name. Change the name before saving, or open the existing record.`
          : `Other ${entityNoun}s in the directory closely match this name (one contains the other). You may still save if they are genuinely different parties.`}
      </p>
    );
  }

  const showConfirm = typeof onConfirm === 'function' && isContactNameDup && !isContactPan;
  const closeLabel = (() => {
    if (showConfirm) return 'Cancel';
    if (isBlocking && !isContactNameDup) return 'Close';
    return 'Close — I will save from the form if appropriate';
  })();

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
            <div id="name-collision-title" style={{ fontSize: 16, fontWeight: 700, color: titleColor }}>
              {title}
            </div>
            {renderBody()}
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
                {m.pan ? (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>PAN {m.pan}</div>
                ) : null}
                {m.email ? (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{m.email}</div>
                ) : null}
                {m.mobile ? (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{m.mobile}</div>
                ) : null}
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          {showConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmBusy}
              style={{
                ...modalBtnPrimary,
                opacity: confirmBusy ? 0.7 : 1,
                cursor: confirmBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {confirmBusy ? 'Saving…' : confirmLabel}
            </button>
          ) : null}
          <button type="button" onClick={onClose} style={modalBtnSecondary}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalBtnPrimary = {
  padding: '8px 16px',
  background: '#F37920',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

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
