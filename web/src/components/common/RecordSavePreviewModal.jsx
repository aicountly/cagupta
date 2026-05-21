const COMMISSION_MODE_LABELS = {
  referral_only: 'Referral only (tiered %)',
  direct_interaction: 'Direct interaction (50/50 split)',
};

function capitalizeStatus(val) {
  if (!val) return '';
  return val.charAt(0).toUpperCase() + val.slice(1);
}

function hasValue(val) {
  if (val == null) return false;
  if (typeof val === 'boolean') return true;
  if (Array.isArray(val)) return val.length > 0;
  return String(val).trim() !== '';
}

function PreviewRow({ label, value }) {
  if (!hasValue(value)) return null;
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f172a', wordBreak: 'break-word' }}>{display}</div>
    </div>
  );
}

function buildContactRows(payload, labels) {
  const rows = [
    { label: 'Full name', value: payload.displayName },
    { label: 'Status', value: capitalizeStatus(payload.status) },
    { label: 'Group', value: labels.groupName },
    { label: 'Reference', value: payload.reference },
    { label: 'Primary mobile', value: payload.mobile },
    { label: 'Primary email', value: payload.email },
    { label: 'Landline', value: payload.landline },
    { label: 'Secondary mobile', value: payload.secondaryMobile },
    { label: 'WA mobile', value: payload.waMobile },
    { label: 'PAN', value: payload.pan },
    { label: 'GSTIN', value: payload.gstin },
    { label: 'Website', value: payload.website },
    { label: 'City', value: payload.city },
    { label: 'State', value: payload.state },
    { label: 'Country', value: payload.country },
    { label: 'Manager', value: labels.assignedManager || payload.assignedManager },
    { label: 'Linked organizations', value: labels.linkedOrganizations },
    { label: 'Referring affiliate', value: labels.referringAffiliate },
    { label: 'Referral start date', value: payload.referralStartDate },
    {
      label: 'Commission mode',
      value: COMMISSION_MODE_LABELS[payload.commissionMode] || payload.commissionMode,
    },
    { label: 'Client-facing restricted', value: payload.clientFacingRestricted },
    { label: 'Notes', value: payload.notes },
  ];
  return rows.filter((r) => hasValue(r.value));
}

function buildOrganizationRows(payload, labels) {
  const addressParts = [payload.addressLine1, payload.addressLine2].filter((p) => hasValue(p));
  const address = addressParts.length ? addressParts.join(', ') : '';

  const rows = [
    { label: 'Organization name', value: payload.displayName },
    { label: 'Constitution', value: payload.constitution },
    { label: 'PAN', value: payload.pan },
    { label: 'GSTIN', value: payload.gstin },
    { label: 'CIN', value: payload.cin },
    { label: 'Primary contact', value: labels.primaryContact },
    { label: 'Secondary contacts', value: labels.secondaryContacts },
    { label: 'Email', value: payload.email },
    { label: 'Phone', value: payload.phone },
    { label: 'Address', value: address },
    { label: 'City', value: payload.city },
    { label: 'State', value: payload.state },
    { label: 'Country', value: payload.country },
    { label: 'PIN', value: payload.pin },
    { label: 'Status', value: capitalizeStatus(payload.status) },
    { label: 'Group', value: labels.groupName },
    { label: 'Reference', value: payload.reference },
    { label: 'Manager', value: labels.assignedManager || payload.assignedManager },
    { label: 'Referring affiliate', value: labels.referringAffiliate },
    { label: 'Referral start date', value: payload.referralStartDate },
    {
      label: 'Commission mode',
      value: COMMISSION_MODE_LABELS[payload.commissionMode] || payload.commissionMode,
    },
    { label: 'Client-facing restricted', value: payload.clientFacingRestricted },
    { label: 'Notes', value: payload.notes },
  ];
  return rows.filter((r) => hasValue(r.value));
}

/**
 * Read-only summary shown before create/update on Contact and Organization forms.
 */
export default function RecordSavePreviewModal({
  open,
  entityType,
  payload,
  displayLabels = {},
  mode = 'create',
  saveMode = 'quit',
  onConfirm,
  onCancel,
  busy = false,
}) {
  if (!open || !payload) return null;

  const entityLabel = entityType === 'organization' ? 'organization' : 'contact';
  const rows = entityType === 'organization'
    ? buildOrganizationRows(payload, displayLabels)
    : buildContactRows(payload, displayLabels);

  const confirmLabel = mode === 'update'
    ? 'Confirm & update'
    : saveMode === 'addNew'
      ? 'Confirm & create another'
      : 'Confirm & create';

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
    padding: 16,
  };
  const panel = {
    background: '#fff',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 560,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  return (
    <div
      style={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-save-preview-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div id="record-save-preview-title" style={{ fontSize: 16, fontWeight: 700, color: '#0B1F3B' }}>
              Review {entityLabel} details
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              Please verify the details below before {mode === 'update' ? 'updating' : 'creating'} this {entityLabel}.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 4, color: '#64748b' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div
          style={{
            background: '#f8fafc',
            borderRadius: 10,
            padding: '4px 14px',
            marginBottom: 16,
            border: '1px solid #e2e8f0',
          }}
        >
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#64748b', margin: '10px 0' }}>No details to preview.</p>
          ) : (
            rows.map((row) => <PreviewRow key={row.label} label={row.label} value={row.value} />)
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              ...modalBtnPrimary,
              opacity: busy ? 0.7 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              ...modalBtnSecondary,
              opacity: busy ? 0.7 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Back to form
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
