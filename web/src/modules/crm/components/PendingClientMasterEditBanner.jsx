/**
 * Banner shown when a client master edit is pending Super Admin approval.
 *
 * @param {{ pending: object|null, style?: object }} props
 */
export default function PendingClientMasterEditBanner({ pending, style = {} }) {
  if (!pending || !pending.approval_id) return null;

  const changeCount = Array.isArray(pending.change_rows) ? pending.change_rows.length : null;

  return (
    <div
      style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 10,
        padding: '12px 16px',
        fontSize: 13,
        color: '#1e40af',
        lineHeight: 1.5,
        marginBottom: 16,
        ...style,
      }}
    >
      <strong>Client master edit pending approval.</strong>{' '}
      Your changes are awaiting Super Admin review under{' '}
      <strong>Approval #{pending.approval_id}</strong>.
      {pending.entity_display_name ? (
        <> Record: <strong>{pending.entity_display_name}</strong>.</>
      ) : null}
      {changeCount != null && changeCount > 0 ? (
        <> {changeCount} field change{changeCount === 1 ? '' : 's'} proposed.</>
      ) : null}{' '}
      Nothing is saved until approved from Team Approvals.
    </div>
  );
}
