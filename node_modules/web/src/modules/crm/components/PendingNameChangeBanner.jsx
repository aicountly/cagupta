/**
 * Banner shown when a name change is pending Super Admin approval.
 *
 * @param {{ pending: object|null, style?: object }} props
 */
export default function PendingNameChangeBanner({ pending, style = {} }) {
  if (!pending || !pending.approval_id) return null;

  return (
    <div
      style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 10,
        padding: '12px 16px',
        fontSize: 13,
        color: '#92400e',
        lineHeight: 1.5,
        marginBottom: 16,
        ...style,
      }}
    >
      <strong>Name change pending approval.</strong>{' '}
      A name change request is awaiting Super Admin review under{' '}
      <strong>Approval #{pending.approval_id}</strong>.
      {pending.proposed_name && pending.proposed_name !== pending.current_name ? (
        <> Proposed name: <strong>{pending.proposed_name}</strong>.</>
      ) : null}{' '}
      The current name remains until approved from Team Approvals.
    </div>
  );
}
