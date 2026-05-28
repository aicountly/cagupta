import { getBillingProfileByCode } from '../../constants/billingProfiles';

/**
 * Shown when the user selects a billing firm different from the client master default.
 */
export default function BillingProfileDefaultNotice({ defaultCode, selectedCode }) {
  const def = defaultCode ? getBillingProfileByCode(defaultCode) : null;
  if (!def || !selectedCode || selectedCode === defaultCode) {
    return null;
  }

  const label = `${def.code} – ${def.name}`;

  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 8,
        fontSize: 12,
        color: '#92400e',
        lineHeight: 1.5,
      }}
      role="status"
    >
      Client master default billing firm is <strong>{label}</strong>. You have selected a
      different firm for this invoice.
    </div>
  );
}
