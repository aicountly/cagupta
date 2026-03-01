const statusColors = {
  // services / tasks
  not_started:     { bg: '#f1f5f9', color: '#64748b' },
  in_progress:     { bg: '#dbeafe', color: '#1d4ed8' },
  pending_info:    { bg: '#fef3c7', color: '#92400e' },
  pending:         { bg: '#fef3c7', color: '#92400e' },
  review:          { bg: '#ede9fe', color: '#5b21b6' },
  completed:       { bg: '#dcfce7', color: '#166534' },
  done:            { bg: '#dcfce7', color: '#166534' },
  cancelled:       { bg: '#fee2e2', color: '#991b1b' },
  blocked:         { bg: '#fee2e2', color: '#991b1b' },
  // invoices
  draft:           { bg: '#f1f5f9', color: '#64748b' },
  sent:            { bg: '#dbeafe', color: '#1d4ed8' },
  partially_paid:  { bg: '#fef3c7', color: '#92400e' },
  paid:            { bg: '#dcfce7', color: '#166534' },
  overdue:         { bg: '#fee2e2', color: '#991b1b' },
  // clients
  active:          { bg: '#dcfce7', color: '#166534' },
  inactive:        { bg: '#fee2e2', color: '#991b1b' },
  prospect:        { bg: '#dbeafe', color: '#1d4ed8' },
  // appointments
  scheduled:       { bg: '#dbeafe', color: '#1d4ed8' },
  confirmed:       { bg: '#dcfce7', color: '#166534' },
  // leads
  new:             { bg: '#f1f5f9', color: '#64748b' },
  contacted:       { bg: '#dbeafe', color: '#1d4ed8' },
  qualified:       { bg: '#ede9fe', color: '#5b21b6' },
  proposal_sent:   { bg: '#fef3c7', color: '#92400e' },
  won:             { bg: '#dcfce7', color: '#166534' },
  lost:            { bg: '#fee2e2', color: '#991b1b' },
};

export default function StatusBadge({ status }) {
  const s = statusColors[status] || { bg: '#f1f5f9', color: '#475569' };
  const label = status?.replace(/_/g, ' ') ?? '';
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap', letterSpacing: '0.02em', display: 'inline-block' }}>
      {label}
    </span>
  );
}
