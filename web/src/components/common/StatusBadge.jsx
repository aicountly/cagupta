const statusColors = {
  // services / tasks
  not_started:     { bg: '#f1f5f9', color: '#64748b' },
  in_progress:     { bg: '#D8ECF8', color: '#145886' },
  pending_info:    { bg: '#FEF0E4', color: '#C25C10' },
  pending:         { bg: '#FEF0E4', color: '#C25C10' },
  review:          { bg: '#ede9fe', color: '#5b21b6' },
  completed:       { bg: '#E4F5E0', color: '#2E7D22' },
  done:            { bg: '#E4F5E0', color: '#2E7D22' },
  cancelled:       { bg: '#fee2e2', color: '#991b1b' },
  blocked:         { bg: '#fee2e2', color: '#991b1b' },
  // invoices
  draft:           { bg: '#f1f5f9', color: '#64748b' },
  sent:            { bg: '#D8ECF8', color: '#145886' },
  partially_paid:  { bg: '#FEF0E4', color: '#C25C10' },
  paid:            { bg: '#E4F5E0', color: '#2E7D22' },
  overdue:         { bg: '#fee2e2', color: '#991b1b' },
  // clients
  active:          { bg: '#E4F5E0', color: '#2E7D22' },
  inactive:        { bg: '#fee2e2', color: '#991b1b' },
  prospect:        { bg: '#D8ECF8', color: '#145886' },
  // appointments
  scheduled:       { bg: '#D8ECF8', color: '#145886' },
  confirmed:       { bg: '#E4F5E0', color: '#2E7D22' },
  // leads
  new:             { bg: '#f1f5f9', color: '#64748b' },
  contacted:       { bg: '#D8ECF8', color: '#145886' },
  qualified:       { bg: '#ede9fe', color: '#5b21b6' },
  proposal_sent:   { bg: '#FEF0E4', color: '#C25C10' },
  won:             { bg: '#E4F5E0', color: '#2E7D22' },
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
