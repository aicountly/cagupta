/**
 * Banner when a ledger change is pending Super Admin approval.
 */
export default function PendingLedgerChangeBanner({ pending, style = {} }) {
  if (!pending || !pending.approvalId) return null;

  const actionLabel = pending.actionLabel || pending.action || 'change';

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
      <strong>Ledger {actionLabel} pending approval.</strong>{' '}
      A request is awaiting Super Admin review under{' '}
      <strong>Approval #{pending.approvalId}</strong>.
      {pending.txnId ? <> (Txn #{pending.txnId})</> : null}{' '}
      The ledger record stays unchanged until approved from Team Approvals.
    </div>
  );
}
